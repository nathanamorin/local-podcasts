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

func TestUserIDMiddleware_HeaderPresent(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set(userHeader, "alice")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	var seen string
	handler := userIDMiddleware(func(c echo.Context) error {
		seen = currentUserID(c)
		return nil
	})
	require.NoError(t, handler(c))
	require.Equal(t, "alice", seen)
}

func TestUserIDMiddleware_HeaderMissingFallsBackToAnonymous(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	var seen string
	handler := userIDMiddleware(func(c echo.Context) error {
		seen = currentUserID(c)
		return nil
	})
	require.NoError(t, handler(c))
	require.Equal(t, anonymousUser, seen)
}

func TestFavorites_AddListRemove(t *testing.T) {
	db := openTestDB(t)
	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)
	require.NoError(t, db.Create(&podcast.Podcast{Id: "pod-1", Name: "Pod 1"}).Error)
	require.NoError(t, db.Create(&podcast.Podcast{Id: "pod-2", Name: "Pod 2"}).Error)

	e := echo.New()

	addFavorite := func(userID, podcastID string) {
		req := httptest.NewRequest(http.MethodPut, "/me/favorites/"+podcastID, nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("podcast_id")
		c.SetParamValues(podcastID)
		c.Set("user_id", userID)
		require.NoError(t, h.AddFavorite(c))
		require.Equal(t, http.StatusOK, rec.Code)
	}

	listFavorites := func(userID string) []string {
		req := httptest.NewRequest(http.MethodGet, "/me/favorites", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.Set("user_id", userID)
		require.NoError(t, h.ListFavorites(c))
		require.Equal(t, http.StatusOK, rec.Code)
		var resp favoritesResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		return resp.PodcastIDs
	}

	// Favorites are scoped per user.
	addFavorite("alice", "pod-1")
	addFavorite("alice", "pod-2")
	addFavorite("bob", "pod-2")

	require.ElementsMatch(t, []string{"pod-1", "pod-2"}, listFavorites("alice"))
	require.ElementsMatch(t, []string{"pod-2"}, listFavorites("bob"))

	// Re-favoriting is a no-op, not an error.
	addFavorite("alice", "pod-1")
	require.ElementsMatch(t, []string{"pod-1", "pod-2"}, listFavorites("alice"))

	// Removing only affects the requesting user.
	req := httptest.NewRequest(http.MethodDelete, "/me/favorites/pod-1", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("podcast_id")
	c.SetParamValues("pod-1")
	c.Set("user_id", "alice")
	require.NoError(t, h.RemoveFavorite(c))
	require.Equal(t, http.StatusOK, rec.Code)

	require.ElementsMatch(t, []string{"pod-2"}, listFavorites("alice"))
	require.ElementsMatch(t, []string{"pod-2"}, listFavorites("bob"))
}

func TestListFavorites_NoneReturnsEmptyArrayNotNull(t *testing.T) {
	db := openTestDB(t)
	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/me/favorites", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("user_id", "someone-with-no-favorites")

	require.NoError(t, h.ListFavorites(c))
	require.JSONEq(t, `{"podcast_ids": []}`, rec.Body.String())
}
