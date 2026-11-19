// Command local-podcasts-worker claims and performs background jobs
// (episode audio downloads, audio fingerprinting) from the main app's
// internal job API, so this work can run on a separate, horizontally
// scalable set of pods instead of the single API server pod.
//
// Workers have no database access and no filesystem access to the main
// app's audio storage at all (it's a ReadWriteOnce PVC mounted only by the
// main app pod). All audio bytes move over plain HTTP: downloads are
// fetched from the source and then uploaded to the main app, and
// fingerprinting re-fetches the already-downloaded episode from the main
// app's public streaming endpoint. This keeps SQLite access
// single-process/single-writer and lets worker pods scale/schedule freely
// with zero storage coupling, regardless of worker replica count.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/ardanlabs/conf/v3"
	"github.com/nathanamorin/local-podcasts/fingerprint"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

var build = "develop"

type workerConfig struct {
	InternalAPIURL string        `conf:"default:http://local-podcasts-internal.local-podcasts.svc.cluster.local:8081,help:base URL of the main app's internal job API (claim/complete/upload)"`
	PublicAPIURL   string        `conf:"default:http://local-podcasts.local-podcasts.svc.cluster.local:8080,help:base URL of the main app's public API (used to stream audio for fingerprinting)"`
	PollInterval   time.Duration `conf:"default:3s,help:how often to poll for a new job when idle"`
	Concurrency    int           `conf:"default:2,help:number of jobs this pod processes concurrently"`
	JobTypes       string        `conf:"default:download;fingerprint,help:semicolon-separated job types this worker pod accepts (split on comma or semicolon)"`
}

// jobResponse mirrors handlers.jobResponse — the two are not shared via
// import to keep the worker binary decoupled from the handlers/echo stack.
type jobResponse struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	PodcastID   string `json:"podcast_id"`
	EpisodeID   string `json:"episode_id"`
	RSSAudioURL string `json:"rss_audio_url,omitempty"`
}

func main() {
	cfg := workerConfig{}
	help, err := conf.Parse("LOCAL_PODCASTS_WORKER", &cfg)
	if err != nil {
		if errors.Is(err, conf.ErrHelpWanted) {
			fmt.Println(help)
			os.Exit(0)
		}
		klog.Fatalf("parsing config: %s", err)
	}

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = fmt.Sprintf("worker-%d", os.Getpid())
	}

	types := strings.FieldsFunc(cfg.JobTypes, func(r rune) bool { return r == ',' || r == ';' })
	klog.Infof("starting local-podcasts worker build[%s] internal-api[%s] public-api[%s] id[%s] types[%v] concurrency[%d]",
		build, cfg.InternalAPIURL, cfg.PublicAPIURL, hostname, types, cfg.Concurrency)

	client := &http.Client{Timeout: 15 * time.Minute} // generous: large episode downloads

	var wg sync.WaitGroup
	for i := 0; i < cfg.Concurrency; i++ {
		wg.Add(1)
		workerID := fmt.Sprintf("%s-%d", hostname, i)
		go func() {
			defer wg.Done()
			runLoop(client, cfg, workerID, types)
		}()
	}
	wg.Wait()
}

func runLoop(client *http.Client, cfg workerConfig, workerID string, types []string) {
	for {
		job, err := claimJob(client, cfg.InternalAPIURL, workerID, types)
		if err != nil {
			klog.Errorf("worker %s: error claiming job: %s", workerID, err)
			time.Sleep(cfg.PollInterval)
			continue
		}
		if job == nil {
			time.Sleep(cfg.PollInterval)
			continue
		}

		klog.Infof("worker %s: claimed job %s (%s) for episode %s", workerID, job.ID, job.Type, job.EpisodeID)
		processJob(client, cfg.InternalAPIURL, cfg.PublicAPIURL, job)
	}
}

func claimJob(client *http.Client, internalURL, workerID string, types []string) (*jobResponse, error) {
	body, err := json.Marshal(map[string]interface{}{"types": types, "worker_id": workerID})
	if err != nil {
		return nil, err
	}

	resp, err := client.Post(internalURL+"/internal/jobs/claim", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected HTTP %d claiming job: %s", resp.StatusCode, string(data))
	}

	var job jobResponse
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return nil, fmt.Errorf("decode claim response: %w", err)
	}
	return &job, nil
}

func processJob(client *http.Client, internalURL, publicURL string, job *jobResponse) {
	if podcast.JobType(job.Type) == podcast.JobTypeDownload {
		// Download jobs complete themselves via the upload endpoint (the
		// main app is the only process that can write to its own PVC).
		if err := doDownloadAndUpload(client, internalURL, job); err != nil {
			klog.Errorf("job %s (download) failed: %s", job.ID, err)
			completeJob(client, internalURL, job.ID, false, err.Error(), nil)
		}
		return
	}

	var result interface{}
	var procErr error

	switch podcast.JobType(job.Type) {
	case podcast.JobTypeFingerprint:
		result, procErr = doFingerprint(client, publicURL, job)
	default:
		procErr = fmt.Errorf("unknown job type %q", job.Type)
	}

	if procErr != nil {
		klog.Errorf("job %s (%s) failed: %s", job.ID, job.Type, procErr)
		completeJob(client, internalURL, job.ID, false, procErr.Error(), nil)
		return
	}

	resultBytes, err := json.Marshal(result)
	if err != nil {
		klog.Errorf("job %s: marshal result: %s", job.ID, err)
		completeJob(client, internalURL, job.ID, false, err.Error(), nil)
		return
	}
	completeJob(client, internalURL, job.ID, true, "", resultBytes)
}

// doDownloadAndUpload fetches the episode audio from its source URL into a
// local scratch file, validates it, then streams it to the main app's
// upload endpoint, which persists it to the PVC and completes the job.
func doDownloadAndUpload(client *http.Client, internalURL string, job *jobResponse) error {
	if job.RSSAudioURL == "" {
		return fmt.Errorf("download job missing rss_audio_url")
	}

	tmpFile, err := os.CreateTemp("", "local-podcasts-download-*")
	if err != nil {
		return fmt.Errorf("create scratch file: %w", err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	if _, err := podcast.DownloadAudioFile(job.RSSAudioURL, tmpPath); err != nil {
		return err
	}
	if err := podcast.ValidateAudioFile(tmpPath); err != nil {
		return fmt.Errorf("downloaded file failed validation: %w", err)
	}

	filename := podcast.EpisodeAudioFilename(job.EpisodeID, job.RSSAudioURL)

	f, err := os.Open(tmpPath)
	if err != nil {
		return fmt.Errorf("reopen scratch file: %w", err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat scratch file: %w", err)
	}

	uploadURL := fmt.Sprintf("%s/internal/jobs/%s/upload?filename=%s", internalURL, job.ID, url.QueryEscape(filename))
	req, err := http.NewRequest(http.MethodPost, uploadURL, f)
	if err != nil {
		return fmt.Errorf("build upload request: %w", err)
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("upload audio: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected HTTP %d uploading audio: %s", resp.StatusCode, string(data))
	}
	return nil
}

func doFingerprint(client *http.Client, publicURL string, job *jobResponse) (*podcast.FingerprintJobResult, error) {
	streamURL := fmt.Sprintf("%s/podcasts/%s/episodes/%s/stream", publicURL, job.PodcastID, job.EpisodeID)

	resp, err := client.Get(streamURL)
	if err != nil {
		return nil, fmt.Errorf("fetch audio for fingerprinting: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected HTTP %d fetching audio: %s", resp.StatusCode, string(data))
	}

	tmpFile, err := os.CreateTemp("", "local-podcasts-fingerprint-*")
	if err != nil {
		return nil, fmt.Errorf("create scratch file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		return nil, fmt.Errorf("write scratch file: %w", err)
	}
	tmpFile.Close()

	chunks, err := fingerprint.ComputeFingerprints(tmpPath)
	if err != nil {
		return nil, err
	}

	result := &podcast.FingerprintJobResult{Chunks: make([]podcast.FingerprintChunk, 0, len(chunks))}
	for _, c := range chunks {
		result.Chunks = append(result.Chunks, podcast.FingerprintChunk{StartSec: c.StartSec, Hash: c.Hash})
	}
	return result, nil
}

func completeJob(client *http.Client, internalURL, jobID string, success bool, errMsg string, result json.RawMessage) {
	body, err := json.Marshal(map[string]interface{}{
		"success": success,
		"error":   errMsg,
		"result":  result,
	})
	if err != nil {
		klog.Errorf("job %s: marshal completion: %s", jobID, err)
		return
	}

	resp, err := client.Post(internalURL+"/internal/jobs/"+jobID+"/complete", "application/json", bytes.NewReader(body))
	if err != nil {
		klog.Errorf("job %s: error reporting completion: %s", jobID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		klog.Errorf("job %s: unexpected HTTP %d reporting completion: %s", jobID, resp.StatusCode, string(data))
	}
}
