package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

// claimJobsRequest is the body workers POST to claim a unit of work.
type claimJobsRequest struct {
	// Types restricts which job types this worker is willing to perform
	// (e.g. a worker pool could specialize in just "download" or just
	// "fingerprint"). If empty, both types are considered.
	Types []podcast.JobType `json:"types"`
	// WorkerID identifies the claiming worker pod (e.g. its hostname) for
	// observability and lease debugging.
	WorkerID string `json:"worker_id"`
}

// jobResponse is what /internal/jobs/claim returns for a claimed job.
//
// Worker pods have no filesystem access to the main app's audio storage at
// all (it's backed by a ReadWriteOnce PVC mounted only by the main app
// pod — see deployments/apps/local-podcasts.yaml in k8s-deployment) and no
// database access either. So all audio bytes move over HTTP:
//   - download jobs: the worker fetches RSSAudioURL itself, then uploads the
//     result to /internal/jobs/{id}/upload, which is what actually persists
//     it to the PVC (only the main app process can write there).
//   - fingerprint jobs: the worker fetches the already-downloaded episode via
//     the existing public streaming endpoint
//     (GET /podcasts/{podcast_id}/episodes/{episode_id}/stream) and only
//     reports back the small computed hash chunks.
type jobResponse struct {
	ID        string          `json:"id"`
	Type      podcast.JobType `json:"type"`
	PodcastID string          `json:"podcast_id"`
	EpisodeID string          `json:"episode_id"`

	// Download jobs only.
	RSSAudioURL string `json:"rss_audio_url,omitempty"`
}

// ClaimJob godoc
// @Summary      Claim a background job
// @Description  Internal API used by worker pods to claim the oldest pending download/fingerprint job. Returns 204 if none is available. Not intended for external/user use.
// @Tags         internal
// @Accept       json
// @Produce      json
// @Param        request body claimJobsRequest true "claim request"
// @Success      200  {object}  jobResponse
// @Success      204
// @Failure      500  {object}  map[string]string
// @Router       /internal/jobs/claim [post]
func (h *Handler) ClaimJob(c echo.Context) error {
	var req claimJobsRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	types := req.Types
	if len(types) == 0 {
		types = []podcast.JobType{podcast.JobTypeDownload, podcast.JobTypeFingerprint}
	}

	job, err := podcast.ClaimJob(h.db, types, req.WorkerID)
	if err != nil {
		klog.Errorf("error claiming job for worker %q: %s", req.WorkerID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error claiming job"})
	}
	if job == nil {
		return c.NoContent(http.StatusNoContent)
	}

	resp := jobResponse{
		ID:        job.ID,
		Type:      job.Type,
		PodcastID: job.PodcastID,
		EpisodeID: job.EpisodeID,
	}

	if job.Type == podcast.JobTypeDownload {
		p, err := h.pw.GetPodcast(job.PodcastID)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error loading podcast for job"})
		}
		ep, ok := p.EpisodeByID(job.EpisodeID)
		if !ok {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "episode not found for job"})
		}
		resp.RSSAudioURL = ep.AudioFile
	}

	return c.JSON(http.StatusOK, resp)
}

// completeJobRequest is the body workers POST when finishing a claimed job.
type completeJobRequest struct {
	Success bool            `json:"success"`
	Error   string          `json:"error,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
}

// CompleteJob godoc
// @Summary      Report a background job's outcome
// @Description  Internal API used by worker pods to report success/failure of a previously claimed job. For download jobs, use /internal/jobs/{job_id}/upload instead (it completes the job itself once the file is persisted). Not intended for external/user use.
// @Tags         internal
// @Accept       json
// @Produce      json
// @Param        job_id  path  string  true  "job ID"
// @Param        request body completeJobRequest true "completion payload"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /internal/jobs/{job_id}/complete [post]
func (h *Handler) CompleteJob(c echo.Context) error {
	jobID := c.Param("job_id")

	var req completeJobRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if err := podcast.CompleteJob(h.db, jobID, req.Success, req.Error, req.Result); err != nil {
		klog.Errorf("error completing job %s: %s", jobID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error completing job"})
	}

	h.pw.InvalidateCache()
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// UploadJobAudio godoc
// @Summary      Upload a download job's audio file
// @Description  Internal API used by worker pods to persist a downloaded episode's audio bytes (the main app's audio storage is a ReadWriteOnce PVC only it can write to). The request body is the raw audio file. Completes the job on success. Not intended for external/user use.
// @Tags         internal
// @Accept       application/octet-stream
// @Produce      json
// @Param        job_id    path   string  true  "job ID"
// @Param        filename  query  string  true  "local filename to save as (see podcast.EpisodeAudioFilename)"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /internal/jobs/{job_id}/upload [post]
func (h *Handler) UploadJobAudio(c echo.Context) error {
	jobID := c.Param("job_id")
	filename := c.QueryParam("filename")
	if filename == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "missing filename query param"})
	}

	job, err := podcast.GetJob(h.db, jobID)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "job not found"})
	}

	podcastDir := filepath.Join(h.config.FileHome, job.PodcastID)
	if err := os.MkdirAll(podcastDir, 0764); err != nil {
		klog.Errorf("job %s: error creating podcast dir: %s", jobID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error creating storage directory"})
	}
	destPath := filepath.Join(podcastDir, filename)

	fail := func(msg string) error {
		_ = podcast.CompleteJob(h.db, jobID, false, msg, nil)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": msg})
	}

	file, err := os.Create(destPath)
	if err != nil {
		return fail(fmt.Sprintf("create %s: %s", destPath, err))
	}
	n, err := file.ReadFrom(c.Request().Body)
	file.Close()
	if err != nil {
		os.Remove(destPath)
		return fail(fmt.Sprintf("write %s: %s", destPath, err))
	}
	if n == 0 {
		os.Remove(destPath)
		return fail("uploaded 0 bytes")
	}

	if err := podcast.ValidateAudioFile(destPath); err != nil {
		os.Remove(destPath)
		return fail(fmt.Sprintf("audio validation failed: %s", err))
	}

	length, err := podcast.GetAudioLength(destPath)
	if err != nil {
		klog.Warningf("job %s: could not determine audio length of %s: %s", jobID, destPath, err)
		length = 0
	}

	result, err := json.Marshal(podcast.DownloadJobResult{LocalFilename: filename, LengthSeconds: length})
	if err != nil {
		return fail(fmt.Sprintf("marshal result: %s", err))
	}

	if err := podcast.CompleteJob(h.db, jobID, true, "", result); err != nil {
		klog.Errorf("job %s: error completing after upload: %s", jobID, err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error completing job"})
	}

	h.pw.InvalidateCache()
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// queueLengthResponse is served by QueueLength for KEDA's metrics-api
// scaler trigger.
type queueLengthResponse struct {
	QueueLength int64 `json:"queueLength"`
}

// QueueLength godoc
// @Summary      Pending job queue length
// @Description  Internal API used by KEDA's metrics-api scaler trigger to read the current total pending job count (across all job types) directly from the app, without going through a Prometheus scrape/query round-trip. Not intended for external/user use.
// @Tags         internal
// @Produce      json
// @Success      200  {object}  queueLengthResponse
// @Failure      500  {object}  map[string]string
// @Router       /internal/jobs/queue-length [get]
func (h *Handler) QueueLength(c echo.Context) error {
	count, err := podcast.PendingJobCount(h.readDB)
	if err != nil {
		klog.Errorf("error counting pending jobs: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error counting pending jobs"})
	}
	return c.JSON(http.StatusOK, queueLengthResponse{QueueLength: count})
}
