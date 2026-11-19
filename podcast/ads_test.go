package podcast

import (
	"testing"

	"github.com/nathanamorin/local-podcasts/fingerprint"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFindAdCandidates_ClustersConsecutiveCrossEpisodeMatches(t *testing.T) {
	db := openTestDB(t)

	// Episode A and B share a 3-chunk run (an "ad") at different absolute
	// offsets, plus one isolated, non-consecutive coincidental match that
	// should be filtered out by the minClusterChunks requirement.
	rows := []EpisodeFingerprint{
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 10, Hash: 0x00000000FF},
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 12, Hash: 0x000000FF00},
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 14, Hash: 0x0000FF0000},
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 50, Hash: 0x00FF000000},

		{PodcastID: "p2", EpisodeID: "epB", StartSec: 30, Hash: 0x00000000FF},
		{PodcastID: "p2", EpisodeID: "epB", StartSec: 32, Hash: 0x000000FF00},
		{PodcastID: "p2", EpisodeID: "epB", StartSec: 34, Hash: 0x0000FF0000},
		{PodcastID: "p2", EpisodeID: "epB", StartSec: 90, Hash: 0x00FF000000},
	}
	require.NoError(t, db.Create(&rows).Error)

	candidates, err := FindAdCandidates(db, 0, 2)
	require.NoError(t, err)
	require.Len(t, candidates, 1)

	c := candidates[0]
	assert.Equal(t, "epA", c.EpisodeAID)
	assert.Equal(t, "epB", c.EpisodeBID)
	assert.Equal(t, 10.0, c.StartASec)
	assert.Equal(t, 30.0, c.StartBSec)
	assert.InDelta(t, 14+fingerprint.WindowSec, c.EndASec, 0.001)
}

func TestFindAdCandidates_IgnoresSameEpisodeMatches(t *testing.T) {
	db := openTestDB(t)
	rows := []EpisodeFingerprint{
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 0, Hash: 0x1},
		{PodcastID: "p1", EpisodeID: "epA", StartSec: 100, Hash: 0x1},
	}
	require.NoError(t, db.Create(&rows).Error)

	candidates, err := FindAdCandidates(db, 0, 1)
	require.NoError(t, err)
	assert.Empty(t, candidates)
}
