package podcast

import (
	"testing"

	"github.com/nathanamorin/local-podcasts/fingerprint"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func fp(podcastID, episodeID string, startSec float64, hash uint64) EpisodeFingerprint {
	return EpisodeFingerprint{
		PodcastID:  podcastID,
		EpisodeID:  episodeID,
		StartSec:   startSec,
		Hash:       HashBits(hash),
		HashBucket: hashBucket(hash),
	}
}

func TestDetectAdsForEpisode_ClustersConsecutiveMatchesWithinSamePodcast(t *testing.T) {
	db := openTestDB(t)

	// Episode A and B (same podcast) share a 3-chunk run (an "ad") at
	// different absolute offsets, plus one isolated, non-consecutive
	// coincidental match that should be filtered out by the
	// minClusterChunks requirement.
	rows := []EpisodeFingerprint{
		fp("p1", "epA", 10, 0x00000000FF),
		fp("p1", "epA", 12, 0x000000FF00),
		fp("p1", "epA", 14, 0x0000FF0000),
		fp("p1", "epA", 50, 0x00FF000000),

		fp("p1", "epB", 30, 0x00000000FF),
		fp("p1", "epB", 32, 0x000000FF00),
		fp("p1", "epB", 34, 0x0000FF0000),
		fp("p1", "epB", 90, 0x00FF000000),
	}
	require.NoError(t, db.Create(&rows).Error)

	require.NoError(t, detectAdsForEpisode(db, "p1", "epA"))

	candidates, err := FindAdCandidates(db, "")
	require.NoError(t, err)
	require.Len(t, candidates, 1)

	c := candidates[0]
	assert.Equal(t, "epA", c.EpisodeAID)
	assert.Equal(t, "epB", c.EpisodeBID)
	assert.Equal(t, 10.0, c.StartASec)
	assert.Equal(t, 30.0, c.StartBSec)
	assert.InDelta(t, 14+fingerprint.WindowSec, c.EndASec, 0.001)
}

func TestDetectAdsForEpisode_IgnoresOtherPodcasts(t *testing.T) {
	db := openTestDB(t)

	rows := []EpisodeFingerprint{
		fp("p1", "epA", 10, 0x1),
		fp("p1", "epA", 12, 0x2),
		// Same hashes, but a different podcast - must not be matched.
		fp("p2", "epB", 30, 0x1),
		fp("p2", "epB", 32, 0x2),
	}
	require.NoError(t, db.Create(&rows).Error)

	require.NoError(t, detectAdsForEpisode(db, "p1", "epA"))

	candidates, err := FindAdCandidates(db, "")
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestDetectAdsForEpisode_ReplacesStaleSegmentsOnRerun(t *testing.T) {
	db := openTestDB(t)

	rows := []EpisodeFingerprint{
		fp("p1", "epA", 10, 0x000000FF),
		fp("p1", "epA", 12, 0x0000FF00),
		fp("p1", "epB", 30, 0x000000FF),
		fp("p1", "epB", 32, 0x0000FF00),
	}
	require.NoError(t, db.Create(&rows).Error)
	require.NoError(t, detectAdsForEpisode(db, "p1", "epA"))

	candidates, err := FindAdCandidates(db, "")
	require.NoError(t, err)
	require.Len(t, candidates, 1)

	// Re-fingerprinting epA with no more overlap should clear the
	// previously detected segment on the next detect_ads run for epA.
	require.NoError(t, db.Where("episode_id = ?", "epA").Delete(&EpisodeFingerprint{}).Error)
	require.NoError(t, db.Create(&EpisodeFingerprint{PodcastID: "p1", EpisodeID: "epA", StartSec: 200, Hash: HashBits(0xFFFFFFFFFFFFFFFF), HashBucket: hashBucket(0xFFFFFFFFFFFFFFFF)}).Error)
	require.NoError(t, detectAdsForEpisode(db, "p1", "epA"))

	candidates, err = FindAdCandidates(db, "")
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestFindAdCandidates_MergesCloseGapsOnQueriedEpisodeSide(t *testing.T) {
	db := openTestDB(t)

	// epA has two detected ad segments against two different partner
	// episodes. The gap between them (100 -> 105 = 5s) is <= the length
	// of the longer adjacent ad (10s), so they should be merged into one
	// skip range from episodeID's perspective.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 90, EndASec: 100, StartBSec: 10, EndBSec: 20}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epC", EpisodeBID: "epA", StartASec: 40, EndASec: 60, StartBSec: 105, EndBSec: 125}).Error)
	// A third, far-away segment (gap 500s, much larger than either ad)
	// must remain separate.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epD", StartASec: 625, EndASec: 635, StartBSec: 1, EndBSec: 11}).Error)

	candidates, err := FindAdCandidates(db, "epA")
	require.NoError(t, err)
	require.Len(t, candidates, 2)

	assert.Equal(t, "epA", candidates[0].EpisodeAID)
	assert.Equal(t, 90.0, candidates[0].StartASec)
	assert.Equal(t, 125.0, candidates[0].EndASec)

	assert.Equal(t, "epA", candidates[1].EpisodeAID)
	assert.Equal(t, 625.0, candidates[1].StartASec)
	assert.Equal(t, 635.0, candidates[1].EndASec)
}

func TestFindAdCandidates_MergesTransitivelyAcrossMultiplePasses(t *testing.T) {
	db := openTestDB(t)

	// Three ad segments on epA: A(0-10, len10), B(50-55, len5), C(58-100,
	// len42). A single left-to-right pass would merge B into C (gap 3 <=
	// max(5,42)=42, producing BC 50-100, len50), but it would never
	// revisit A, even though gap(A,BC) = 40 <= max(10,50) = 50 now also
	// qualifies. Merging must therefore be run repeatedly until a full
	// pass makes no further changes, collapsing all three into one range.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 0, EndASec: 10, StartBSec: 1, EndBSec: 11}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epC", StartASec: 50, EndASec: 55, StartBSec: 1, EndBSec: 6}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epD", StartASec: 58, EndASec: 100, StartBSec: 1, EndBSec: 43}).Error)

	candidates, err := FindAdCandidates(db, "epA")
	require.NoError(t, err)
	require.Len(t, candidates, 1)
	assert.Equal(t, 0.0, candidates[0].StartASec)
	assert.Equal(t, 100.0, candidates[0].EndASec)
}

func TestFindAdCandidates_DensityMergesFragmentedAdPod(t *testing.T) {
	db := openTestDB(t)

	// Reproduces the reported scenario: four short matches (7s, 7s, 7s,
	// 57s) spread across ~265s, none of which qualify for the pairwise
	// gap-merge (every gap exceeds the adjacent pair's own max length),
	// but all four fall within one 300s window with 4 (>=3) candidates
	// and 78/300 = 26% (>=5%) combined coverage - a real fragmented ad
	// pod, not isolated noise.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 2278, EndASec: 2285, StartBSec: 1, EndBSec: 8}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epC", StartASec: 2338, EndASec: 2345, StartBSec: 1, EndBSec: 8}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epD", StartASec: 2408, EndASec: 2415, StartBSec: 1, EndBSec: 8}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epE", StartASec: 2486, EndASec: 2543, StartBSec: 1, EndBSec: 58}).Error)

	candidates, err := FindAdCandidates(db, "epA")
	require.NoError(t, err)
	require.Len(t, candidates, 1)
	assert.Equal(t, 2278.0, candidates[0].StartASec)
	assert.Equal(t, 2543.0, candidates[0].EndASec)
}

func TestFindAdCandidates_DensityPassRequiresAtLeastThreeCandidates(t *testing.T) {
	db := openTestDB(t)

	// Only two 7s candidates, 100s apart (gap 100 > max(7,7)=7, so no
	// pairwise gap-merge either). Both fall in the same 300s window, but
	// a window with only 2 candidates must not density-merge, no matter
	// how much of the window they cover.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 0, EndASec: 7, StartBSec: 1, EndBSec: 8}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epC", StartASec: 107, EndASec: 114, StartBSec: 1, EndBSec: 8}).Error)

	candidates, err := FindAdCandidates(db, "epA")
	require.NoError(t, err)
	require.Len(t, candidates, 2)
	assert.Equal(t, 0.0, candidates[0].StartASec)
	assert.Equal(t, 7.0, candidates[0].EndASec)
	assert.Equal(t, 107.0, candidates[1].StartASec)
	assert.Equal(t, 114.0, candidates[1].EndASec)
}

func TestFindAdCandidates_DensityPassRequiresMinimumCoverage(t *testing.T) {
	db := openTestDB(t)

	// Three 1s candidates spread 100s apart (gap 100 > max(1,1)=1, so no
	// pairwise gap-merge either). All three fall in one 300s window
	// (count=3 qualifies), but they only cover 3/300 = 1% of it - far
	// below the 5% coverage threshold - so this must remain 3 separate,
	// essentially-isolated blips rather than being swept into one span.
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 0, EndASec: 1, StartBSec: 1, EndBSec: 2}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epC", StartASec: 101, EndASec: 102, StartBSec: 1, EndBSec: 2}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epD", StartASec: 202, EndASec: 203, StartBSec: 1, EndBSec: 2}).Error)

	candidates, err := FindAdCandidates(db, "epA")
	require.NoError(t, err)
	require.Len(t, candidates, 3)
}

func TestFindAdCandidates_FiltersByEpisodeID(t *testing.T) {
	db := openTestDB(t)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 1, EndASec: 2, StartBSec: 3, EndBSec: 4}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epC", EpisodeBID: "epD", StartASec: 5, EndASec: 6, StartBSec: 7, EndBSec: 8}).Error)

	candidates, err := FindAdCandidates(db, "epB")
	require.NoError(t, err)
	require.Len(t, candidates, 1)
	// Filtered results are normalized so EpisodeAID always refers to the
	// queried episode, regardless of which side it originally matched on.
	assert.Equal(t, "epB", candidates[0].EpisodeAID)
	assert.Equal(t, "epA", candidates[0].EpisodeBID)

	all, err := FindAdCandidates(db, "")
	require.NoError(t, err)
	assert.Len(t, all, 2)
}
