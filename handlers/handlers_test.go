package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// seedPodcastWithEpisodes creates a podcast with n episodes (strictly
// decreasing publish timestamps, episode 0 newest) directly in the DB.
func seedPodcastWithEpisodes(t *testing.T, db *gorm.DB, podcastID string, n int) {
	t.Helper()
	require.NoError(t, db.Create(&podcast.Podcast{Id: podcastID, Name: "Test Podcast " + podcastID}).Error)
	for i := 0; i < n; i++ {
		require.NoError(t, db.Create(&podcast.Episode{
			PodcastID:        podcastID,
			Id:               fmt.Sprintf("%s-ep-%03d", podcastID, i),
			Name:             fmt.Sprintf("Episode %d", i),
			PublishTimestamp: int64(1_700_000_000 - i),
		}).Error)
	}
}

func TestListPodcasts_Pagination(t *testing.T) {
	db := openTestDB(t)
	for i := 0; i < 5; i++ {
		seedPodcastWithEpisodes(t, db, fmt.Sprintf("pod-%d", i), 1)
	}

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts?page=1&page_size=2", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.ListPodcasts(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp podcastList
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Podcasts, 2)
	require.Equal(t, int64(5), resp.Pagination.Total)
	require.True(t, resp.Pagination.HasMore)

	// Last page should report HasMore=false.
	req = httptest.NewRequest(http.MethodGet, "/podcasts?page=3&page_size=2", nil)
	rec = httptest.NewRecorder()
	c = e.NewContext(req, rec)
	require.NoError(t, h.ListPodcasts(c))

	resp = podcastList{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Podcasts, 1)
	require.False(t, resp.Pagination.HasMore)
}

func TestListEpisodes_Pagination(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 25)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes?page=1&page_size=10", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id")
	c.SetParamValues("pod-1")

	require.NoError(t, h.ListEpisodes(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp episodeList
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Episodes, 10)
	require.Equal(t, int64(25), resp.Pagination.Total)
	require.True(t, resp.Pagination.HasMore)
	require.Equal(t, "pod-1-ep-000", resp.Episodes[0].Id, "episodes should be newest-first")

	// Third (last) page has only 5 remaining and HasMore should be false.
	req = httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes?page=3&page_size=10", nil)
	rec = httptest.NewRecorder()
	c = e.NewContext(req, rec)
	c.SetParamNames("podcast_id")
	c.SetParamValues("pod-1")

	require.NoError(t, h.ListEpisodes(c))
	resp = episodeList{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Episodes, 5)
	require.False(t, resp.Pagination.HasMore)
}

func TestGetEpisode_Handler(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 3)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes/pod-1-ep-001", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id", "episode_id")
	c.SetParamValues("pod-1", "pod-1-ep-001")

	require.NoError(t, h.GetEpisode(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var ep podcast.Episode
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &ep))
	require.Equal(t, "pod-1-ep-001", ep.Id)
}

func TestGetEpisode_Handler_NotFound(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 1)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes/doesnotexist", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id", "episode_id")
	c.SetParamValues("pod-1", "doesnotexist")

	require.NoError(t, h.GetEpisode(c))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetEpisodeTranscript_Handler(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 1)
	require.NoError(t, db.Create(&podcast.EpisodeTranscript{
		PodcastID: "pod-1",
		EpisodeID: "pod-1-ep-000",
		Language:  "en",
		Text:      "hello world",
		Segments:  podcast.TranscriptSegments{{Index: 0, StartMs: 0, EndMs: 500, Text: "hello world"}},
	}).Error)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes/pod-1-ep-000/transcript", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id", "episode_id")
	c.SetParamValues("pod-1", "pod-1-ep-000")

	require.NoError(t, h.GetEpisodeTranscript(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var transcript podcast.EpisodeTranscript
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &transcript))
	require.Equal(t, "hello world", transcript.Text)
	require.Len(t, transcript.Segments, 1)
}

func TestGetEpisodeTranscript_Handler_NotFound(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 1)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1/episodes/pod-1-ep-000/transcript", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id", "episode_id")
	c.SetParamValues("pod-1", "pod-1-ep-000")

	require.NoError(t, h.GetEpisodeTranscript(c))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetPodcast_OmitsEpisodes(t *testing.T) {
	db := openTestDB(t)
	seedPodcastWithEpisodes(t, db, "pod-1", 3)

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/podcasts/pod-1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id")
	c.SetParamValues("pod-1")

	require.NoError(t, h.GetPodcast(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp podcast.Podcast
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Empty(t, resp.Episodes, "GetPodcast should omit the full episode list now that paginated endpoints exist")
}
