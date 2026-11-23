package podcast

import (
	"math"
	"sort"
	"time"

	"github.com/nathanamorin/local-podcasts/fingerprint"
	"gorm.io/gorm"
	"k8s.io/klog/v2"
)

// defaultMaxHamming and defaultMinClusterChunks are the default thresholds
// used by FindAdCandidates when the caller doesn't specify one (<= 0).
const (
	defaultMaxHamming       = 6 // out of 64 bits
	defaultMinClusterChunks = 2 // consecutive overlapping-window matches required to call it a candidate
)

// AdCandidate is a segment of audio that two different episodes appear to
// share (e.g. the same ad), expressed as the matching time range in each
// episode. This is a candidate for user review, not an automatic skip.
// Matching is only ever done within a single podcast's own episodes (ads
// are podcast-specific, e.g. host-read sponsor reads) - see
// detectAdsForEpisode.
type AdCandidate struct {
	PodcastAID string  `json:"podcast_a_id"`
	EpisodeAID string  `json:"episode_a_id"`
	StartASec  float64 `json:"start_a_sec"`
	EndASec    float64 `json:"end_a_sec"`
	PodcastBID string  `json:"podcast_b_id"`
	EpisodeBID string  `json:"episode_b_id"`
	StartBSec  float64 `json:"start_b_sec"`
	EndBSec    float64 `json:"end_b_sec"`
}

// AdSegment is the persisted form of an AdCandidate, computed once by the
// detect_ads background job (see detectAdsForEpisode) after an episode is
// fingerprinted, rather than recomputed on every API request. The live
// /ads/candidates endpoint reads straight from this table - see
// handlers.ListAdCandidates.
type AdSegment struct {
	ID         uint      `json:"-" gorm:"primaryKey;autoIncrement"`
	PodcastID  string    `json:"podcast_id" gorm:"index"`
	EpisodeAID string    `json:"episode_a_id" gorm:"index"`
	StartASec  float64   `json:"start_a_sec"`
	EndASec    float64   `json:"end_a_sec"`
	EpisodeBID string    `json:"episode_b_id" gorm:"index"`
	StartBSec  float64   `json:"start_b_sec"`
	EndBSec    float64   `json:"end_b_sec"`
	CreatedAt  time.Time `json:"-"`
}

type fingerprintMatch struct {
	a, b EpisodeFingerprint
}

// FindAdCandidates reads the persisted AdSegment table (populated by the
// detect_ads background job - see detectAdsForEpisode) and returns it as
// AdCandidate values, optionally filtered to segments involving a single
// episode. This is a fast, already-computed lookup - no fingerprint
// comparison happens on the request path.
func FindAdCandidates(db *gorm.DB, episodeID string) ([]AdCandidate, error) {
	q := db.Model(&AdSegment{})
	if episodeID != "" {
		q = q.Where("episode_a_id = ? OR episode_b_id = ?", episodeID, episodeID)
	}

	var segments []AdSegment
	if err := q.Order("start_a_sec").Find(&segments).Error; err != nil {
		return nil, err
	}

	candidates := make([]AdCandidate, 0, len(segments))
	for _, s := range segments {
		candidates = append(candidates, AdCandidate{
			PodcastAID: s.PodcastID,
			EpisodeAID: s.EpisodeAID,
			StartASec:  s.StartASec,
			EndASec:    s.EndASec,
			PodcastBID: s.PodcastID,
			EpisodeBID: s.EpisodeBID,
			StartBSec:  s.StartBSec,
			EndBSec:    s.EndBSec,
		})
	}
	return candidates, nil
}

// detectAdsForEpisode compares one episode's fingerprints against every
// other episode *of the same podcast* (ads are podcast-specific, e.g.
// host-read sponsor segments - cross-podcast matches aren't meaningful
// here), clusters consecutive overlapping-window matches into candidate
// segments, and replaces that episode's AdSegment rows with the result.
//
// Unlike the old request-time FindAdCandidates, this only ever loads
// fingerprints sharing one of this episode's own HashBucket values
// (indexed lookup) instead of the whole episode_fingerprints table, and
// only within the one podcast - both bound the comparison set even as the
// table grows into the tens of millions of rows.
func detectAdsForEpisode(db *gorm.DB, podcastID, episodeID string) error {
	var mine []EpisodeFingerprint
	if err := db.Where("podcast_id = ? AND episode_id = ?", podcastID, episodeID).Find(&mine).Error; err != nil {
		return err
	}

	if len(mine) == 0 {
		// No fingerprints (e.g. a silent/empty episode) - nothing to
		// compare; still clear any stale segments from a prior run.
		return replaceEpisodeSegments(db, podcastID, episodeID, nil)
	}

	bucketSet := make(map[uint32]struct{})
	for _, fp := range mine {
		bucketSet[fp.HashBucket] = struct{}{}
	}
	buckets := make([]uint32, 0, len(bucketSet))
	for b := range bucketSet {
		buckets = append(buckets, b)
	}

	var others []EpisodeFingerprint
	if err := db.Where("podcast_id = ? AND episode_id != ? AND hash_bucket IN ?", podcastID, episodeID, buckets).
		Find(&others).Error; err != nil {
		return err
	}

	grouped := make(map[uint32][]EpisodeFingerprint, len(buckets))
	for _, fp := range others {
		grouped[fp.HashBucket] = append(grouped[fp.HashBucket], fp)
	}

	var matches []fingerprintMatch
	for _, a := range mine {
		for _, b := range grouped[a.HashBucket] {
			if fingerprint.HammingDistance(a.Hash.Uint64(), b.Hash.Uint64()) <= defaultMaxHamming {
				matches = append(matches, fingerprintMatch{a, b})
			}
		}
	}

	candidates := clusterMatches(matches, defaultMinClusterChunks)
	return replaceEpisodeSegments(db, podcastID, episodeID, candidates)
}

// replaceEpisodeSegments atomically deletes any existing AdSegment rows
// involving episodeID and inserts the freshly computed ones. Deleting by
// "involving" (either side) rather than just "generated by" keeps the table
// consistent if this episode's fingerprints changed (re-fingerprinted) -
// stale rows describing a now-outdated match against this episode are
// removed even if they were originally inserted by the *other* episode's
// detect_ads run.
func replaceEpisodeSegments(db *gorm.DB, podcastID, episodeID string, candidates []AdCandidate) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("podcast_id = ? AND (episode_a_id = ? OR episode_b_id = ?)", podcastID, episodeID, episodeID).
			Delete(&AdSegment{}).Error; err != nil {
			return err
		}
		if len(candidates) == 0 {
			return nil
		}
		rows := make([]AdSegment, 0, len(candidates))
		for _, c := range candidates {
			rows = append(rows, AdSegment{
				PodcastID:  podcastID,
				EpisodeAID: c.EpisodeAID,
				StartASec:  c.StartASec,
				EndASec:    c.EndASec,
				EpisodeBID: c.EpisodeBID,
				StartBSec:  c.StartBSec,
				EndBSec:    c.EndBSec,
			})
		}
		return tx.CreateInBatches(rows, 200).Error
	})
}

// clusterMatches groups fingerprint matches by (unordered) episode pair,
// then walks each pair's matches in time order, grouping consecutive
// hop-aligned matches into a single AdCandidate segment.
func clusterMatches(matches []fingerprintMatch, minClusterChunks int) []AdCandidate {
	type episodePairKey struct{ ep1, ep2 string }
	grouped := make(map[episodePairKey][]fingerprintMatch)
	for _, m := range matches {
		pa, pb := m.a, m.b
		if pa.EpisodeID > pb.EpisodeID {
			pa, pb = pb, pa
		}
		key := episodePairKey{pa.EpisodeID, pb.EpisodeID}
		grouped[key] = append(grouped[key], fingerprintMatch{pa, pb})
	}

	var candidates []AdCandidate
	for _, group := range grouped {
		sort.Slice(group, func(i, j int) bool { return group[i].a.StartSec < group[j].a.StartSec })

		var cluster []fingerprintMatch
		flush := func() {
			if len(cluster) >= minClusterChunks {
				first, last := cluster[0], cluster[len(cluster)-1]
				candidates = append(candidates, AdCandidate{
					PodcastAID: first.a.PodcastID,
					EpisodeAID: first.a.EpisodeID,
					StartASec:  first.a.StartSec,
					EndASec:    last.a.StartSec + fingerprint.WindowSec,
					PodcastBID: first.b.PodcastID,
					EpisodeBID: first.b.EpisodeID,
					StartBSec:  first.b.StartSec,
					EndBSec:    last.b.StartSec + fingerprint.WindowSec,
				})
			}
			cluster = nil
		}

		for _, m := range group {
			if len(cluster) == 0 {
				cluster = append(cluster, m)
				continue
			}
			prev := cluster[len(cluster)-1]
			deltaA := m.a.StartSec - prev.a.StartSec
			deltaB := m.b.StartSec - prev.b.StartSec
			// "Consecutive" means both sides advanced by about one hop —
			// allows a little drift but rejects unrelated, far-apart matches.
			if math.Abs(deltaA-fingerprint.HopSec) < fingerprint.HopSec/2 &&
				math.Abs(deltaB-fingerprint.HopSec) < fingerprint.HopSec/2 {
				cluster = append(cluster, m)
			} else {
				flush()
				cluster = append(cluster, m)
			}
		}
		flush()
	}

	sort.Slice(candidates, func(i, j int) bool { return candidates[i].StartASec < candidates[j].StartASec })
	return candidates
}

// adDetectPollInterval bounds how often RunAdDetectionLoop checks for a new
// detect_ads job when idle.
const adDetectPollInterval = 5 * time.Second

// RunAdDetectionLoop continuously claims and runs detect_ads jobs (see
// JobTypeDetectAds) in-process, blocking until ctxDone is closed. Unlike
// download/fingerprint jobs (claimed by separate worker pods over HTTP),
// ad-detection needs direct, indexed DB access to compare fingerprints, so
// it runs inside the main app itself - call this once from a goroutine at
// startup (see cmd/server/main.go).
func RunAdDetectionLoop(db *gorm.DB, done <-chan struct{}) {
	for {
		select {
		case <-done:
			return
		default:
		}

		job, err := ClaimJob(db, []JobType{JobTypeDetectAds}, "main-app")
		if err != nil {
			klog.Errorf("error claiming ad-detection job: %s", err)
			time.Sleep(adDetectPollInterval)
			continue
		}
		if job == nil {
			time.Sleep(adDetectPollInterval)
			continue
		}

		err = detectAdsForEpisode(db, job.PodcastID, job.EpisodeID)
		if err != nil {
			klog.Errorf("ad-detection job %s (episode %s) failed: %s", job.ID, job.EpisodeID, err)
		}
		if completeErr := CompleteJob(db, job.ID, err == nil, errString(err), nil); completeErr != nil {
			klog.Errorf("error completing ad-detection job %s: %s", job.ID, completeErr)
		}
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
