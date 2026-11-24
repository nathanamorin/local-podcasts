package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// testDatabaseDSN mirrors podcast.testDatabaseDSN (unexported there) so this
// package's tests can also target a real Postgres instance - ClaimJob's
// behavior depends on genuine Postgres semantics.
func testDatabaseDSN() string {
	if dsn := os.Getenv("LOCAL_PODCASTS_TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://postgres:postgres@localhost:5433/local_podcasts_test?sslmode=disable"
}

// openTestDB opens an isolated-schema connection to a real test Postgres
// instance, auto-migrated via podcast.InitDB.
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	schema := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "_")
	sep := "?"
	if strings.Contains(testDatabaseDSN(), "?") {
		sep = "&"
	}
	dsn := fmt.Sprintf("%s%ssearch_path=%s", testDatabaseDSN(), sep, schema)

	setup, err := gorm.Open(postgres.Open(testDatabaseDSN()))
	require.NoError(t, err, "connect to test postgres at %s (see LOCAL_PODCASTS_TEST_DATABASE_URL)", testDatabaseDSN())
	require.NoError(t, setup.Exec(fmt.Sprintf("CREATE SCHEMA %q", schema)).Error)
	t.Cleanup(func() {
		_ = setup.Exec(fmt.Sprintf("DROP SCHEMA %q CASCADE", schema)).Error
		sqlDB, err := setup.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	db, err := podcast.InitDB(dsn, 4)
	require.NoError(t, err)
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

// TestClaimJob_DownloadJobUsesRSSAudioURLNotLocalAudioFile is a regression
// test for a bug where ClaimJob sent the worker ep.AudioFile (which, once an
// episode has been successfully downloaded once, is a local filename like
// "<episode_id>.mp3" rather than a URL) instead of ep.RSSAudioURL. Any
// download job re-created for an already-downloaded episode would then be
// doomed to fail with "unsupported protocol scheme" since the worker can't
// HTTP GET a bare local filename.
func TestClaimJob_DownloadJobUsesRSSAudioURLNotLocalAudioFile(t *testing.T) {
	db := openTestDB(t)

	const podcastID = "pod-1"
	const episodeID = "ep-1"
	const rssURL = "https://example.com/feed/ep-1.mp3"
	const localFile = "ep-1.mp3" // what AudioFile becomes after a successful download

	require.NoError(t, db.Create(&podcast.Podcast{Id: podcastID, Name: "Test Podcast"}).Error)
	require.NoError(t, db.Create(&podcast.Episode{
		PodcastID:   podcastID,
		Id:          episodeID,
		Name:        "Test Episode",
		AudioFile:   localFile, // already downloaded once
		RSSAudioURL: rssURL,
	}).Error)
	require.NoError(t, podcast.EnqueueDownloadJob(db, podcastID, episodeID))

	pw := podcast.NewPodcastWatcher(podcast.Config{}, db)
	h := New(podcast.Config{}, &pw, db)

	e := echo.New()
	body, err := json.Marshal(claimJobsRequest{WorkerID: "test-worker"})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/claim", bytes.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	require.NoError(t, h.ClaimJob(c))
	require.Equal(t, http.StatusOK, rec.Code)

	var resp jobResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, rssURL, resp.RSSAudioURL, "ClaimJob must hand workers the real RSS URL, not the local audio filename")
}
