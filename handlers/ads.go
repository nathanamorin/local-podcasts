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

type rescanFingerprintsResponse struct {
	Enqueued int `json:"enqueued"`
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
	candidates, err := podcast.FindAdCandidates(h.db, c.QueryParam("episode_id"))
	if err != nil {
		klog.Errorf("error finding ad candidates: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error finding ad candidates"})
	}

	return c.JSON(http.StatusOK, adCandidatesResponse{Candidates: candidates})
}

// RescanFingerprints godoc
// @Summary      Rescan for episodes missing fingerprints
// @Description  Enqueues a fingerprint job for every downloaded episode that doesn't yet have fingerprint data, including ones whose fingerprint job previously failed (e.g. after a bug fix). Safe to call repeatedly - episodes already pending/processing are skipped.
// @Tags         ads
// @Produce      json
// @Success      200  {object}  rescanFingerprintsResponse
// @Failure      500  {object}  map[string]string
// @Router       /ads/rescan-fingerprints [post]
func (h *Handler) RescanFingerprints(c echo.Context) error {
	enqueued, err := podcast.EnqueueMissingFingerprintJobs(h.db)
	if err != nil {
		klog.Errorf("error rescanning for missing fingerprints: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error rescanning for missing fingerprints"})
	}

	return c.JSON(http.StatusOK, rescanFingerprintsResponse{Enqueued: enqueued})
}
