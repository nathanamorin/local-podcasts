package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

// userHeader is the header Istio's ext_authz gating injects with the
// authenticated Pocket ID username, once the request has passed the
// pocket-id-sso AuthorizationPolicy at the Gateway (see
// envoyExtAuthzHttp.headersToUpstreamOnAllow in
// k8s-deployment/deployments/platform/istio/02-istiod.yaml and the gated
// hosts list in deployments/networking/pocket-id-sso.yaml). Only hosts
// actually gated behind that policy (currently
// podcasts.internal.morinapps.com) are guaranteed to have it set.
const userHeader = "X-Auth-Request-User"

// anonymousUser is used when userHeader is absent - e.g. local
// development run directly against the app (not through the Istio
// Gateway), or if the app is ever exposed on an ungated host again. This
// keeps per-user features degrading to a single shared "anonymous" user
// rather than failing outright, consistent with this app's existing
// low-security, single-household posture (see the client-status
// handlers' doc comment).
const anonymousUser = "anonymous"

// userIDMiddleware reads the authenticated user ID injected by Istio and
// stores it on the request context for handlers to read via currentUserID.
func userIDMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		userID := c.Request().Header.Get(userHeader)
		if userID == "" {
			userID = anonymousUser
		}
		c.Set("user_id", userID)
		return next(c)
	}
}

func currentUserID(c echo.Context) string {
	if v, ok := c.Get("user_id").(string); ok && v != "" {
		return v
	}
	return anonymousUser
}

type currentUserResponse struct {
	UserID string `json:"user_id"`
}

// GetCurrentUser godoc
// @Summary      Get the current authenticated user
// @Description  Returns the user ID Istio injected for this request (or "anonymous" if not behind the SSO gate).
// @Tags         user
// @Produce      json
// @Success      200  {object}  currentUserResponse
// @Router       /me [get]
func (h *Handler) GetCurrentUser(c echo.Context) error {
	return c.JSON(http.StatusOK, currentUserResponse{UserID: currentUserID(c)})
}

type favoritesResponse struct {
	PodcastIDs []string `json:"podcast_ids"`
}

// ListFavorites godoc
// @Summary      List the current user's favorited podcasts
// @Tags         user
// @Produce      json
// @Success      200  {object}  favoritesResponse
// @Failure      500  {object}  map[string]string
// @Router       /me/favorites [get]
func (h *Handler) ListFavorites(c echo.Context) error {
	ids, err := podcast.ListUserFavorites(h.db, currentUserID(c))
	if err != nil {
		klog.Errorf("error listing favorites: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error listing favorites"})
	}
	if ids == nil {
		ids = []string{}
	}
	return c.JSON(http.StatusOK, favoritesResponse{PodcastIDs: ids})
}

// AddFavorite godoc
// @Summary      Favorite a podcast
// @Tags         user
// @Produce      json
// @Param        podcast_id  path  string  true  "Podcast ID"
// @Success      200  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /me/favorites/{podcast_id} [put]
func (h *Handler) AddFavorite(c echo.Context) error {
	podcastID := c.Param("podcast_id")
	if err := podcast.AddUserFavorite(h.db, currentUserID(c), podcastID); err != nil {
		klog.Errorf("error adding favorite %s: %s", podcastID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error adding favorite"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "success"})
}

// RemoveFavorite godoc
// @Summary      Un-favorite a podcast
// @Tags         user
// @Produce      json
// @Param        podcast_id  path  string  true  "Podcast ID"
// @Success      200  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /me/favorites/{podcast_id} [delete]
func (h *Handler) RemoveFavorite(c echo.Context) error {
	podcastID := c.Param("podcast_id")
	if err := podcast.RemoveUserFavorite(h.db, currentUserID(c), podcastID); err != nil {
		klog.Errorf("error removing favorite %s: %s", podcastID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error removing favorite"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "success"})
}
