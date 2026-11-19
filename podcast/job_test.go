package podcast

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnqueueDownloadJob_IsIdempotentWhilePending(t *testing.T) {
	db := openTestDB(t)

	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))
	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))

	var count int64
	require.NoError(t, db.Model(&Job{}).Where("podcast_id = ? AND episode_id = ? AND type = ?", "pod1", "ep1", JobTypeDownload).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestClaimJob_ReturnsOldestPendingAndMarksProcessing(t *testing.T) {
	db := openTestDB(t)

	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))
	time.Sleep(10 * time.Millisecond)
	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep2"))

	job, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-1")
	require.NoError(t, err)
	require.NotNil(t, job)
	assert.Equal(t, "ep1", job.EpisodeID)
	assert.Equal(t, JobStatusProcessing, job.Status)
	assert.Equal(t, "worker-1", job.ClaimedBy)
	assert.Equal(t, 1, job.Attempts)

	// The claimed job should no longer be claimable by another worker.
	job2, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-2")
	require.NoError(t, err)
	require.NotNil(t, job2)
	assert.Equal(t, "ep2", job2.EpisodeID)

	job3, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-3")
	require.NoError(t, err)
	assert.Nil(t, job3)
}

func TestClaimJob_RequeuesStuckJob(t *testing.T) {
	db := openTestDB(t)
	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))

	job, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-1")
	require.NoError(t, err)
	require.NotNil(t, job)

	// Simulate a worker that claimed the job long ago and crashed.
	staleTime := time.Now().Add(-2 * jobLeaseTimeout)
	require.NoError(t, db.Model(&Job{}).Where("id = ?", job.ID).Update("claimed_at", staleTime).Error)

	job2, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-2")
	require.NoError(t, err)
	require.NotNil(t, job2)
	assert.Equal(t, job.ID, job2.ID)
	assert.Equal(t, "worker-2", job2.ClaimedBy)
}

func TestCompleteJob_DownloadSuccess_UpdatesEpisodeAndChainsFingerprintJob(t *testing.T) {
	db := openTestDB(t)
	p := NewPodcastObj()
	p.Id = "pod1"
	p.Name = "Pod One"
	p.Episodes = []*Episode{{PodcastID: "pod1", Id: "ep1", AudioFile: "http://example.com/ep1.mp3"}}
	require.NoError(t, p.SavePodcastMetadata(Config{FileHome: t.TempDir()}, db))
	for _, ep := range p.Episodes {
		require.NoError(t, db.Save(ep).Error)
	}

	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))
	job, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-1")
	require.NoError(t, err)
	require.NotNil(t, job)

	result, err := json.Marshal(DownloadJobResult{LocalFilename: "ep1.mp3", LengthSeconds: 123})
	require.NoError(t, err)

	require.NoError(t, CompleteJob(db, job.ID, true, "", result))

	var ep Episode
	require.NoError(t, db.Where("podcast_id = ? AND id = ?", "pod1", "ep1").First(&ep).Error)
	assert.Equal(t, "ep1.mp3", ep.AudioFile)
	assert.Equal(t, int64(123), ep.Length)

	var doneJob Job
	require.NoError(t, db.First(&doneJob, "id = ?", job.ID).Error)
	assert.Equal(t, JobStatusDone, doneJob.Status)

	var fpCount int64
	require.NoError(t, db.Model(&Job{}).Where("type = ? AND episode_id = ? AND status = ?", JobTypeFingerprint, "ep1", JobStatusPending).Count(&fpCount).Error)
	assert.Equal(t, int64(1), fpCount, "expected a fingerprint job to be chained after download success")
}

func TestCompleteJob_FingerprintSuccess_WritesChunksIdempotently(t *testing.T) {
	db := openTestDB(t)
	require.NoError(t, EnqueueFingerprintJob(db, "pod1", "ep1"))
	job, err := ClaimJob(db, []JobType{JobTypeFingerprint}, "worker-1")
	require.NoError(t, err)
	require.NotNil(t, job)

	result, err := json.Marshal(FingerprintJobResult{Chunks: []FingerprintChunk{
		// A hash with the high bit set reproduces a real SQLite driver
		// failure ("uint64 values with high bit set are not supported")
		// unless EpisodeFingerprint.Hash is stored via HashBits.
		{StartSec: 0, Hash: 0xFFFFFFFFFFFFFFFF},
		{StartSec: 2, Hash: 2},
	}})
	require.NoError(t, err)
	require.NoError(t, CompleteJob(db, job.ID, true, "", result))

	var count int64
	require.NoError(t, db.Model(&EpisodeFingerprint{}).Where("episode_id = ?", "ep1").Count(&count).Error)
	assert.Equal(t, int64(2), count)

	var highBitFP EpisodeFingerprint
	require.NoError(t, db.Where("episode_id = ? AND start_sec = ?", "ep1", float64(0)).First(&highBitFP).Error)
	assert.Equal(t, uint64(0xFFFFFFFFFFFFFFFF), highBitFP.Hash.Uint64())

	// Re-running fingerprinting for the same episode should replace, not
	// duplicate, prior chunks (idempotent re-runs / backfill).
	require.NoError(t, EnqueueFingerprintJob(db, "pod1", "ep1"))
	job2, err := ClaimJob(db, []JobType{JobTypeFingerprint}, "worker-2")
	require.NoError(t, err)
	require.NotNil(t, job2)

	result2, err := json.Marshal(FingerprintJobResult{Chunks: []FingerprintChunk{{StartSec: 0, Hash: 42}}})
	require.NoError(t, err)
	require.NoError(t, CompleteJob(db, job2.ID, true, "", result2))

	require.NoError(t, db.Model(&EpisodeFingerprint{}).Where("episode_id = ?", "ep1").Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestCompleteJob_FailureRequeuesUntilMaxAttempts(t *testing.T) {
	db := openTestDB(t)
	require.NoError(t, EnqueueDownloadJob(db, "pod1", "ep1"))

	var jobID string
	for i := 0; i < jobMaxAttempts; i++ {
		job, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-1")
		require.NoError(t, err)
		require.NotNil(t, job, "attempt %d", i)
		jobID = job.ID
		require.NoError(t, CompleteJob(db, job.ID, false, "boom", nil))
	}

	var finalJob Job
	require.NoError(t, db.First(&finalJob, "id = ?", jobID).Error)
	assert.Equal(t, JobStatusFailed, finalJob.Status)
	assert.Equal(t, jobMaxAttempts, finalJob.Attempts)

	// Failed jobs are no longer claimable.
	job, err := ClaimJob(db, []JobType{JobTypeDownload}, "worker-2")
	require.NoError(t, err)
	assert.Nil(t, job)
}
