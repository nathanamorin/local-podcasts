package podcast

import (
	"math"
	"sort"

	"github.com/nathanamorin/local-podcasts/fingerprint"
	"gorm.io/gorm"
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

type fingerprintMatch struct {
	a, b EpisodeFingerprint
}

// FindAdCandidates scans stored EpisodeFingerprint rows for windows that
// match (Hamming distance <= maxHamming) across *different* episodes, then
// clusters consecutive overlapping-window matches between the same pair of
// episodes into candidate segments (requiring at least minClusterChunks
// consecutive matches, to filter out one-off coincidental matches).
//
// This does a bucketed pairwise comparison (grouping by the top 24 bits of
// the hash) rather than a full O(n^2) scan, which is sufficient at the
// current data scale (fingerprinting runs only on newly-downloaded episodes,
// not a full historical backfill) — see the session design notes for the
// tradeoffs of a more scalable approach if/when backfill is added.
func FindAdCandidates(db *gorm.DB, maxHamming int, minClusterChunks int) ([]AdCandidate, error) {
	if maxHamming <= 0 {
		maxHamming = defaultMaxHamming
	}
	if minClusterChunks <= 0 {
		minClusterChunks = defaultMinClusterChunks
	}

	var fps []EpisodeFingerprint
	if err := db.Find(&fps).Error; err != nil {
		return nil, err
	}

	const prefixShift = 40 // top 24 of 64 bits
	buckets := make(map[uint64][]EpisodeFingerprint)
	for _, fp := range fps {
		key := fp.Hash >> prefixShift
		buckets[key] = append(buckets[key], fp)
	}

	var matches []fingerprintMatch
	for _, bucket := range buckets {
		for i := 0; i < len(bucket); i++ {
			for j := i + 1; j < len(bucket); j++ {
				a, b := bucket[i], bucket[j]
				if a.EpisodeID == b.EpisodeID {
					continue // only cross-episode matches indicate shared content like ads
				}
				if fingerprint.HammingDistance(a.Hash, b.Hash) <= maxHamming {
					matches = append(matches, fingerprintMatch{a, b})
				}
			}
		}
	}

	return clusterMatches(matches, minClusterChunks), nil
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
