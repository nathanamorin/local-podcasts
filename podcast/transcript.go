package podcast

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TranscriptSegment is one decoded segment of a whisper transcription,
// mirroring (a subset of) kronk's bucky model.Segment - just enough to
// render a seek-to-text UI later (start/end timestamps + text) without
// coupling this package's stored schema to the kronk SDK's own types.
type TranscriptSegment struct {
	Index   int32  `json:"index"`
	StartMs int64  `json:"start_ms"`
	EndMs   int64  `json:"end_ms"`
	Text    string `json:"text"`
}

// TranscriptSegments is the JSON-encoded-column type for
// EpisodeTranscript.Segments, following the same Valuer/Scanner pattern as
// HashBits (see job.go) - the established convention in this codebase for
// storing a structured value in a single DB column.
type TranscriptSegments []TranscriptSegment

func (s TranscriptSegments) Value() (driver.Value, error) {
	if s == nil {
		return "[]", nil
	}
	b, err := json.Marshal(s)
	if err != nil {
		return nil, fmt.Errorf("marshal transcript segments: %w", err)
	}
	return string(b), nil
}

func (s *TranscriptSegments) Scan(src interface{}) error {
	if src == nil {
		*s = nil
		return nil
	}

	var raw []byte
	switch v := src.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("TranscriptSegments.Scan: unsupported source type %T", src)
	}

	var segments []TranscriptSegment
	if err := json.Unmarshal(raw, &segments); err != nil {
		return fmt.Errorf("unmarshal transcript segments: %w", err)
	}
	*s = segments
	return nil
}

// EpisodeTranscript is the full whisper transcription of one episode's
// audio. There's exactly one row per episode - PodcastID/EpisodeID is
// uniquely indexed, and applyTranscribeResult upserts into it, so
// re-running a transcription (e.g. after a model/config change) simply
// replaces the prior result rather than accumulating history.
type EpisodeTranscript struct {
	ID        uint               `json:"-" gorm:"primaryKey;autoIncrement"`
	PodcastID string             `json:"podcast_id" gorm:"uniqueIndex:idx_episode_transcripts_podcast_episode,priority:1"`
	EpisodeID string             `json:"episode_id" gorm:"uniqueIndex:idx_episode_transcripts_podcast_episode,priority:2"`
	Language  string             `json:"language"`
	Text      string             `json:"text" gorm:"type:text"`
	Segments  TranscriptSegments `json:"segments" gorm:"type:text"`
	CreatedAt time.Time          `json:"created_at"`
	UpdatedAt time.Time          `json:"updated_at"`
}

// GetEpisodeTranscript returns the stored transcription for an episode, or
// gorm.ErrRecordNotFound if it hasn't been transcribed yet (or is still
// pending/in-flight).
func GetEpisodeTranscript(db *gorm.DB, podcastID, episodeID string) (*EpisodeTranscript, error) {
	var t EpisodeTranscript
	if err := db.Where("podcast_id = ? AND episode_id = ?", podcastID, episodeID).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// upsertEpisodeTranscript replaces any existing transcription for the given
// episode with the new one, keyed on the podcast_id/episode_id unique
// index.
func upsertEpisodeTranscript(db *gorm.DB, t *EpisodeTranscript) error {
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "podcast_id"}, {Name: "episode_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"language", "text", "segments", "updated_at"}),
	}).Create(t).Error
}
