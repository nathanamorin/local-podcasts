package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

type adCandidatesResponse struct {
	Candidates []podcast.AdCandidate `json:"candidates"`
}

// ListAdCandidates godoc
// @Summary      List ad candidates
// @Description  Returns audio segments detected as shared across two different episodes (e.g. ads), based on fingerprint matching. These are candidates for user review, not automatically skipped. Optionally filtered to just the segments involving a given episode (used by the player to know what to skip).
// @Tags         ads
// @Produce      json
// @Param        episode_id  query  string  false  "only return candidates involving this episode"
// @Success      200  {object}  adCandidatesResponse
// @Failure      500  {object}  map[string]string
// @Router       /ads/candidates [get]
func (h *Handler) ListAdCandidates(c echo.Context) error {
	candidates, err := podcast.FindAdCandidates(h.db, 0, 0)
	if err != nil {
		klog.Errorf("error finding ad candidates: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error finding ad candidates"})
	}

	if episodeID := c.QueryParam("episode_id"); episodeID != "" {
		filtered := make([]podcast.AdCandidate, 0, len(candidates))
		for _, cand := range candidates {
			if cand.EpisodeAID == episodeID || cand.EpisodeBID == episodeID {
				filtered = append(filtered, cand)
			}
		}
		candidates = filtered
	}

	return c.JSON(http.StatusOK, adCandidatesResponse{Candidates: candidates})
}
