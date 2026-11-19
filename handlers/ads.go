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
// @Description  Returns audio segments detected as shared across two different episodes (e.g. ads), based on fingerprint matching. These are candidates for user review, not automatically skipped.
// @Tags         ads
// @Produce      json
// @Success      200  {object}  adCandidatesResponse
// @Failure      500  {object}  map[string]string
// @Router       /ads/candidates [get]
func (h *Handler) ListAdCandidates(c echo.Context) error {
	candidates, err := podcast.FindAdCandidates(h.db, 0, 0)
	if err != nil {
		klog.Errorf("error finding ad candidates: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error finding ad candidates"})
	}
	return c.JSON(http.StatusOK, adCandidatesResponse{Candidates: candidates})
}
