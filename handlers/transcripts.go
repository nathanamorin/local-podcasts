package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

type rescanTranscriptsResponse struct {
	Enqueued int `json:"enqueued"`
}

// RescanTranscripts godoc
// @Summary      Rescan for episodes missing transcripts
// @Description  Enqueues a whisper transcribe job for every downloaded episode that doesn't yet have a transcript, including ones whose transcribe job previously failed (e.g. after a bug fix). Safe to call repeatedly - episodes already pending/processing are skipped.
// @Tags         podcasts
// @Produce      json
// @Success      200  {object}  rescanTranscriptsResponse
// @Failure      500  {object}  map[string]string
// @Router       /transcripts/rescan [post]
func (h *Handler) RescanTranscripts(c echo.Context) error {
	enqueued, err := podcast.EnqueueMissingTranscribeJobs(h.db)
	if err != nil {
		klog.Errorf("error rescanning for missing transcripts: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error rescanning for missing transcripts"})
	}

	return c.JSON(http.StatusOK, rescanTranscriptsResponse{Enqueued: enqueued})
}
