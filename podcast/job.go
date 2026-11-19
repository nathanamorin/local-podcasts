package podcast

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nathanamorin/local-podcasts/metrics"
	"gorm.io/gorm"
	"k8s.io/klog/v2"
)

// JobType identifies the kind of background work a Job represents. Jobs are
// produced by the main app (which owns the SQLite DB) and consumed by
// separate, horizontally-scalable worker pods over the internal
// claim/complete HTTP API (see handlers/jobs.go) — workers never touch the
// DB directly.
type JobType string

const (
	JobTypeDownload    JobType = "download"
	JobTypeFingerprint JobType = "fingerprint"
)

// JobStatus is the lifecycle state of a Job.
type JobStatus string

const (
	JobStatusPending    JobStatus = "pending"
	JobStatusProcessing JobStatus = "processing"
	JobStatusDone       JobStatus = "done"
	JobStatusFailed     JobStatus = "failed"
)

// jobLeaseTimeout bounds how long a worker may hold a claimed job before it's
// considered abandoned (e.g. the worker pod crashed or was evicted) and
// requeued for another worker to pick up.
const jobLeaseTimeout = 30 * time.Minute

// jobMaxAttempts bounds retries before a job is marked failed instead of
// requeued, so a permanently-broken episode doesn't retry forever.
const jobMaxAttempts = 5

// Job is a unit of background work (download an episode's audio, or compute
// fingerprints for an already-downloaded episode) claimed and completed by
// worker pods via the internal HTTP API.
type Job struct {
	ID        string     `json:"id" gorm:"primaryKey"`
	Type      JobType    `json:"type" gorm:"index"`
	PodcastID string     `json:"podcast_id"`
	EpisodeID string     `json:"episode_id"`
	Status    JobStatus  `json:"status" gorm:"index"`
	Attempts  int        `json:"attempts"`
	ClaimedBy string     `json:"claimed_by,omitempty"`
	ClaimedAt *time.Time `json:"claimed_at,omitempty"`
	Error     string     `json:"error,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// HashBits is a 64-bit audio-fingerprint hash (see the fingerprint package).
// It's stored as its bit-for-bit reinterpreted int64, because database/sql
// drivers (including SQLite) only accept int64 driver.Values - a uint64 with
// the high bit set (true for ~half of all hash values) fails with
// "uint64 values with high bit set are not supported". Use Uint64() to get
// the value back out for bitwise comparisons (Hamming distance, bucketing).
type HashBits uint64

func (h HashBits) Value() (driver.Value, error) {
	return int64(h), nil
}

func (h *HashBits) Scan(src interface{}) error {
	i, ok := src.(int64)
	if !ok {
		return fmt.Errorf("HashBits.Scan: unsupported source type %T", src)
	}
	*h = HashBits(i)
	return nil
}

// Uint64 returns the hash's bit pattern as an unsigned integer, for use in
// bitwise comparisons (the DB-storage representation is intentionally a
// bit-reinterpreted int64 - see HashBits).
func (h HashBits) Uint64() uint64 {
	return uint64(h)
}

// EpisodeFingerprint is one overlapping-window audio fingerprint (see the
// fingerprint package for how the hash is computed) for a given episode,
// used to detect segments (e.g. ads) shared across episodes.
type EpisodeFingerprint struct {
	ID        uint     `json:"-" gorm:"primaryKey;autoIncrement"`
	PodcastID string   `json:"podcast_id" gorm:"index"`
	EpisodeID string   `json:"episode_id" gorm:"index"`
	StartSec  float64  `json:"start_sec"`
	Hash      HashBits `json:"hash" gorm:"index"`
}

// enqueueJob creates a pending job for the given episode, unless one of the
// same type already exists for it in a non-terminal state (pending or
// processing) — keeps re-syncing a feed or re-running backfill idempotent.
// Returns whether a new job was actually created.
func enqueueJob(db *gorm.DB, jobType JobType, podcastID, episodeID string) (bool, error) {
	var existing int64
	err := db.Model(&Job{}).
		Where("type = ? AND podcast_id = ? AND episode_id = ? AND status IN ?",
			jobType, podcastID, episodeID, []JobStatus{JobStatusPending, JobStatusProcessing}).
		Count(&existing).Error
	if err != nil {
		return false, fmt.Errorf("check existing jobs: %w", err)
	}
	if existing > 0 {
		return false, nil
	}

	job := Job{
		ID:        uuid.NewString(),
		Type:      jobType,
		PodcastID: podcastID,
		EpisodeID: episodeID,
		Status:    JobStatusPending,
	}
	if err := db.Create(&job).Error; err != nil {
		return false, err
	}
	return true, nil
}

// EnqueueDownloadJob enqueues a job for a worker to download an episode's
// audio file.
func EnqueueDownloadJob(db *gorm.DB, podcastID, episodeID string) error {
	_, err := enqueueJob(db, JobTypeDownload, podcastID, episodeID)
	return err
}

// EnqueueFingerprintJob enqueues a job for a worker to compute audio
// fingerprints for an already-downloaded episode.
func EnqueueFingerprintJob(db *gorm.DB, podcastID, episodeID string) error {
	_, err := enqueueJob(db, JobTypeFingerprint, podcastID, episodeID)
	return err
}

// EnqueueMissingFingerprintJobs scans for episodes that have a downloaded
// audio file but no fingerprint data (e.g. episodes downloaded before
// fingerprinting existed, or whose fingerprint job previously failed - note
// enqueueJob only skips episodes with an in-flight pending/processing job,
// so this safely retries ones stuck in a failed state too), and enqueues a
// fingerprint job for each. Returns the number of jobs actually enqueued.
func EnqueueMissingFingerprintJobs(db *gorm.DB) (int, error) {
	var episodes []Episode
	err := db.Model(&Episode{}).
		Where("audio_file != ?", "").
		Where("id NOT IN (?)", db.Model(&EpisodeFingerprint{}).Select("episode_id")).
		Find(&episodes).Error
	if err != nil {
		return 0, fmt.Errorf("list episodes missing fingerprints: %w", err)
	}

	enqueued := 0
	for _, ep := range episodes {
		created, err := enqueueJob(db, JobTypeFingerprint, ep.PodcastID, ep.Id)
		if err != nil {
			return enqueued, fmt.Errorf("enqueue fingerprint job for episode %s: %w", ep.Id, err)
		}
		if created {
			enqueued++
		}
	}
	return enqueued, nil
}

// GetJob looks up a job by ID.
func GetJob(db *gorm.DB, jobID string) (*Job, error) {
	var job Job
	if err := db.First(&job, "id = ?", jobID).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

// requeueStuckJobs resets any job that's been claimed longer than
// jobLeaseTimeout back to pending, so a crashed/evicted worker doesn't strand
// its job forever.
func requeueStuckJobs(db *gorm.DB) error {
	cutoff := time.Now().Add(-jobLeaseTimeout)
	return db.Model(&Job{}).
		Where("status = ? AND claimed_at < ?", JobStatusProcessing, cutoff).
		Updates(map[string]interface{}{"status": JobStatusPending, "claimed_by": "", "claimed_at": nil}).Error
}

// ClaimJob atomically claims the oldest pending job matching one of the
// given types, for the named worker. It returns (nil, nil) if no job is
// available.
func ClaimJob(db *gorm.DB, types []JobType, workerID string) (*Job, error) {
	if err := requeueStuckJobs(db); err != nil {
		klog.Errorf("error requeuing stuck jobs: %s", err)
	}

	var claimed *Job
	err := db.Transaction(func(tx *gorm.DB) error {
		var job Job
		err := tx.Where("type IN ? AND status = ?", types, JobStatusPending).
			Order("created_at").
			First(&job).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil
			}
			return err
		}

		now := time.Now()
		job.Status = JobStatusProcessing
		job.ClaimedBy = workerID
		job.ClaimedAt = &now
		job.Attempts++
		if err := tx.Save(&job).Error; err != nil {
			return err
		}
		claimed = &job
		return nil
	})
	return claimed, err
}

// DownloadJobResult is the payload a worker POSTs back on a successful
// download job.
type DownloadJobResult struct {
	LocalFilename string `json:"local_filename"`
	LengthSeconds int64  `json:"length_seconds"`
}

// FingerprintJobResult is the payload a worker POSTs back on a successful
// fingerprint job.
type FingerprintJobResult struct {
	Chunks []FingerprintChunk `json:"chunks"`
}

// FingerprintChunk is a single hashed window within an episode.
type FingerprintChunk struct {
	StartSec float64 `json:"start_sec"`
	Hash     uint64  `json:"hash"`
}

// CompleteJob records the outcome of a claimed job. On failure it requeues
// the job (up to jobMaxAttempts) or marks it failed. On success it applies
// the type-specific result (updating the Episode row for downloads, or
// writing EpisodeFingerprint rows for fingerprinting) and, for downloads,
// chains a fingerprint job for the same episode.
func CompleteJob(db *gorm.DB, jobID string, success bool, errMsg string, result json.RawMessage) error {
	var job Job
	if err := db.First(&job, "id = ?", jobID).Error; err != nil {
		return fmt.Errorf("job %s not found: %w", jobID, err)
	}

	if !success {
		job.Error = errMsg
		if job.Attempts >= jobMaxAttempts {
			job.Status = JobStatusFailed
			klog.Errorf("job %s (%s, episode %s) failed permanently after %d attempts: %s",
				job.ID, job.Type, job.EpisodeID, job.Attempts, errMsg)
		} else {
			job.Status = JobStatusPending
			job.ClaimedBy = ""
			job.ClaimedAt = nil
		}
		return db.Save(&job).Error
	}

	switch job.Type {
	case JobTypeDownload:
		if err := applyDownloadResult(db, &job, result); err != nil {
			return err
		}
	case JobTypeFingerprint:
		if err := applyFingerprintResult(db, &job, result); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown job type %q", job.Type)
	}

	job.Status = JobStatusDone
	job.Error = ""
	if err := db.Save(&job).Error; err != nil {
		return err
	}

	if job.Type == JobTypeDownload {
		if err := EnqueueFingerprintJob(db, job.PodcastID, job.EpisodeID); err != nil {
			klog.Errorf("error enqueuing fingerprint job for episode %s: %s", job.EpisodeID, err)
		}
	}
	return nil
}

func applyDownloadResult(db *gorm.DB, job *Job, result json.RawMessage) error {
	var r DownloadJobResult
	if err := json.Unmarshal(result, &r); err != nil {
		return fmt.Errorf("parse download result: %w", err)
	}
	if r.LocalFilename == "" {
		return fmt.Errorf("download result missing local_filename")
	}

	var ep Episode
	if err := db.Where("podcast_id = ? AND id = ?", job.PodcastID, job.EpisodeID).First(&ep).Error; err != nil {
		return fmt.Errorf("load episode %s: %w", job.EpisodeID, err)
	}
	ep.AudioFile = r.LocalFilename
	ep.Length = r.LengthSeconds
	if err := db.Save(&ep).Error; err != nil {
		return fmt.Errorf("save episode %s: %w", job.EpisodeID, err)
	}

	var p Podcast
	podcastName := job.PodcastID
	if err := db.Select("name").Where("id = ?", job.PodcastID).First(&p).Error; err == nil {
		podcastName = p.Name
	}
	metrics.RecordEpisodeDownload(podcastName, metrics.EpisodeDownloadSuccess)
	return nil
}

func applyFingerprintResult(db *gorm.DB, job *Job, result json.RawMessage) error {
	var r FingerprintJobResult
	if err := json.Unmarshal(result, &r); err != nil {
		return fmt.Errorf("parse fingerprint result: %w", err)
	}

	if err := db.Where("podcast_id = ? AND episode_id = ?", job.PodcastID, job.EpisodeID).
		Delete(&EpisodeFingerprint{}).Error; err != nil {
		return fmt.Errorf("clear existing fingerprints for episode %s: %w", job.EpisodeID, err)
	}

	if len(r.Chunks) == 0 {
		return nil
	}

	rows := make([]EpisodeFingerprint, 0, len(r.Chunks))
	for _, c := range r.Chunks {
		rows = append(rows, EpisodeFingerprint{
			PodcastID: job.PodcastID,
			EpisodeID: job.EpisodeID,
			StartSec:  c.StartSec,
			Hash:      HashBits(c.Hash),
		})
	}
	return db.CreateInBatches(rows, 200).Error
}

// RefreshJobGauges recomputes the pending/processing/failed job-queue gauges
// from current DB state. Called on every /metrics scrape (pull-based) rather
// than incrementally, since it's a cheap aggregate query and always reflects
// ground truth.
func RefreshJobGauges(db *gorm.DB) {
	for _, jobType := range []JobType{JobTypeDownload, JobTypeFingerprint} {
		metrics.PendingJobsGauge.WithLabelValues(string(jobType)).Set(countJobs(db, jobType, JobStatusPending))
		metrics.ProcessingJobsGauge.WithLabelValues(string(jobType)).Set(countJobs(db, jobType, JobStatusProcessing))
		metrics.FailedJobsGauge.WithLabelValues(string(jobType)).Set(countJobs(db, jobType, JobStatusFailed))
		metrics.DoneJobsGauge.WithLabelValues(string(jobType)).Set(countJobs(db, jobType, JobStatusDone))
	}
}

func countJobs(db *gorm.DB, jobType JobType, status JobStatus) float64 {
	var count int64
	if err := db.Model(&Job{}).Where("type = ? AND status = ?", jobType, status).Count(&count).Error; err != nil {
		klog.Errorf("error counting jobs (type=%s status=%s): %s", jobType, status, err)
		return 0
	}
	return float64(count)
}
