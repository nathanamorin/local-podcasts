package podcast

import (
	"fmt"
	"strings"
	"testing"

	"github.com/nathanamorin/local-podcasts/metrics"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// collectQueryDurationLabels gathers the current label sets recorded on
// metrics.QueryDuration, keyed by label name, across all observed series.
func collectQueryDurationLabels(t *testing.T) []map[string]string {
	t.Helper()
	ch := make(chan prometheus.Metric, 256)
	metrics.QueryDuration.Collect(ch)
	close(ch)

	var all []map[string]string
	for m := range ch {
		var pb dto.Metric
		require.NoError(t, m.Write(&pb))
		labels := make(map[string]string, len(pb.Label))
		for _, l := range pb.Label {
			labels[l.GetName()] = l.GetValue()
		}
		all = append(all, labels)
	}
	return all
}

// TestRegisterQueryDurationCallbacks_WriteDB verifies that InitDB
// instruments queries into metrics.QueryDuration with a parameterized SQL
// template label - not table name, not bound parameter values - so
// dashboards can see per-query latency without unbounded cardinality from
// the actual parameter data.
func TestRegisterQueryDurationCallbacks_WriteDB(t *testing.T) {
	db := openTestDB(t)

	var count int64
	require.NoError(t, db.Model(&Podcast{}).Where("id = ?", "some-id").Count(&count).Error)

	labels := collectQueryDurationLabels(t)
	require.NotEmpty(t, labels)

	var found bool
	for _, l := range labels {
		if l["db"] == "primary" && l["operation"] == "query" && strings.Contains(l["query"], "podcasts") {
			found = true
			// The query template must contain a placeholder (postgres
			// renders "$1", not "?"), not the literal bound value
			// "some-id".
			assert.Contains(t, l["query"], "$1")
			assert.NotContains(t, l["query"], "some-id")
		}
	}
	assert.True(t, found, "expected a query-duration series for a podcasts query, got labels: %v", labels)
}

// TestNormalizeQueryLabel_CollapsesBulkValues verifies that a multi-row
// VALUES clause (as GORM emits for a batched insert, e.g. the ad-segment
// merge writing hundreds of rows in one statement) is collapsed to a single
// representative tuple, regardless of how many rows the batch had - this is
// what keeps a bulk insert's label cardinality (and length) independent of
// its batch size.
func TestNormalizeQueryLabel_CollapsesBulkValues(t *testing.T) {
	small := `INSERT INTO "ad_segments" ("podcast_id","start_a_sec") VALUES ($1,$2)`
	big := `INSERT INTO "ad_segments" ("podcast_id","start_a_sec") VALUES ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)`

	assert.Equal(t, normalizeQueryLabel(small), normalizeQueryLabel(big),
		"bulk inserts of different batch sizes must normalize to the same label value")
	assert.NotContains(t, normalizeQueryLabel(big), "$9", "collapsed VALUES clause should not retain every row's placeholders")
}

// TestNormalizeQueryLabel_TruncatesLongQueries verifies the hard length cap
// that exists as a final safety net: Mimir rejects an entire remote-write
// batch (not just the offending series) if any single label value exceeds
// its configured max length, so no query template may be allowed through
// unbounded.
func TestNormalizeQueryLabel_TruncatesLongQueries(t *testing.T) {
	longQuery := "SELECT * FROM x WHERE " + strings.Repeat("col = $1 AND ", 50)

	got := normalizeQueryLabel(longQuery)

	assert.LessOrEqual(t, len(got), maxQueryLabelLen+len("...(truncated)"))
}

// TestInitDB_ConcurrentWriters verifies that concurrent writers can all
// succeed against the same DB without error - exercising the connection
// pool under real concurrency, unlike SQLite's single-physical-writer
// model this replaced.
func TestInitDB_ConcurrentWriters(t *testing.T) {
	db := openTestDB(t)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	assert.Equal(t, 4, sqlDB.Stats().MaxOpenConnections)

	const writers = 8
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		go func(i int) {
			p := &Podcast{Id: fmt.Sprintf("pod-%d", i), Name: "test"}
			errs <- db.Create(p).Error
		}(i)
	}
	for i := 0; i < writers; i++ {
		assert.NoError(t, <-errs)
	}

	var count int64
	require.NoError(t, db.Model(&Podcast{}).Count(&count).Error)
	assert.Equal(t, int64(writers), count)
}
