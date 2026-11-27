package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"github.com/stretchr/testify/require"
)

func TestRescanTranscripts_EnqueuesMissingOnly(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 2)
	require.NoError(t, db.Model(&podcast.Episode{}).Where("podcast_id = ?", "pod-1").Update("audio_file", "ep.mp3").Error)
	require.NoError(t, db.Create(&podcast.EpisodeTranscript{PodcastID: "pod-1", EpisodeID: "pod-1-ep-000", Text: "already transcribed"}).Error)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/transcripts/rescan", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.RescanTranscripts(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp rescanTranscriptsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 1, resp.Enqueued, "only the episode without a transcript should be enqueued")
}
