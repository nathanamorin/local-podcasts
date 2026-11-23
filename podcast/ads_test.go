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

func TestFindAdCandidates_FiltersByEpisodeID(t *testing.T) {
	db := openTestDB(t)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epA", EpisodeBID: "epB", StartASec: 1, EndASec: 2, StartBSec: 3, EndBSec: 4}).Error)
	require.NoError(t, db.Create(&AdSegment{PodcastID: "p1", EpisodeAID: "epC", EpisodeBID: "epD", StartASec: 5, EndASec: 6, StartBSec: 7, EndBSec: 8}).Error)

	candidates, err := FindAdCandidates(db, "epB")
	require.NoError(t, err)
	require.Len(t, candidates, 1)
	assert.Equal(t, "epA", candidates[0].EpisodeAID)

	all, err := FindAdCandidates(db, "")
	require.NoError(t, err)
	assert.Len(t, all, 2)
}
