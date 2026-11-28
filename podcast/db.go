package podcast

import (
	"fmt"
	"regexp"
	"time"

	"github.com/nathanamorin/local-podcasts/metrics"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DefaultMaxOpenConns is the recommended maxOpenConns for InitDB when the
// caller has no specific reason to override it. Unlike SQLite (which has a
// single physical writer no matter how many connections Go opens),
// PostgreSQL has true concurrent MVCC transactions, so this directly bounds
// real concurrent DB work; it's sized for dozens of worker pods calling the
// claim/complete API concurrently without saturating Postgres' own
// max_connections.
const DefaultMaxOpenConns = 20

// InitDB opens the single PostgreSQL connection pool used for all app
// access (previously SQLite required a separate read-only pool to avoid
// queueing behind a single writer connection - Postgres' MVCC means readers
// and writers don't block each other, so one pool now serves both).
// dsn is a standard PostgreSQL connection string, e.g.
// "postgres://user:password@host:5432/dbname?sslmode=disable".
func InitDB(dsn string, maxOpenConns int) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres db: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	if maxOpenConns < 1 {
		maxOpenConns = 1
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err = db.AutoMigrate(&Podcast{}, &Episode{}, &Job{}, &EpisodeFingerprint{}, &AdSegment{}, &EpisodeTranscript{}, &UserFavorite{}); err != nil {
		return nil, fmt.Errorf("automigrate: %w", err)
	}

	// Superseded by idx_job_status_priority_created (see Job). AutoMigrate
	// never drops indexes, so remove the stale one explicitly - it would
	// only add write overhead on the hot jobs table.
	if db.Migrator().HasIndex(&Job{}, "idx_job_status_created") {
		if err := db.Migrator().DropIndex(&Job{}, "idx_job_status_created"); err != nil {
			return nil, fmt.Errorf("drop idx_job_status_created: %w", err)
		}
	}

	if err := BackfillJobPriorities(db); err != nil {
		return nil, err
	}

	registerQueryDurationCallbacks(db, "primary")

	return db, nil
}

// queryStartSetting is the key used to pass the operation's start time from
// a callback's "before" hook to its "after" hook via Statement.Settings
// (a sync.Map scoped to a single GORM operation, cleared for the next one).
const queryStartSetting = "metrics:query_start"

// maxQueryLabelLen caps the "query" label value's length. This is defense
// in depth on top of bulkValuesPattern below: Mimir rejects an entire
// remote-write batch (every metric in it, not just the offending series)
// if any single label value exceeds its configured max length, so this
// must never be allowed to grow unbounded.
const maxQueryLabelLen = 200

// bulkValuesPattern matches a multi-row "VALUES (...),(...),(...)" clause
// (as GORM generates for e.g. batched *gorm.DB.CreateInBatches/Save calls)
// and collapses it to a single representative tuple. Without this, a bulk
// insert's query template - and therefore its label cardinality - varies
// with the batch size (the number of rows it was called with), and large
// batches (e.g. the ad-segment merge writing hundreds of rows at once)
// blow well past maxQueryLabelLen on their own.
var bulkValuesPattern = regexp.MustCompile(`(?i)VALUES\s*\([^)]*\)(?:\s*,\s*\([^)]*\))*`)

// normalizeQueryLabel turns a parameterized SQL query template into a safe
// Prometheus label value: every VALUES group (whether a single-row insert
// or a many-row bulk insert) is collapsed to the same fixed placeholder, so
// the label is both stable and independent of batch size, and the result
// is hard-truncated to maxQueryLabelLen as a final safety net.
func normalizeQueryLabel(query string) string {
	query = bulkValuesPattern.ReplaceAllString(query, "VALUES (...)")
	if len(query) > maxQueryLabelLen {
		query = query[:maxQueryLabelLen] + "...(truncated)"
	}
	return query
}

// registerQueryDurationCallbacks instruments every GORM operation type
// (create/query/update/delete/row/raw) on gdb to observe its duration into
// metrics.QueryDuration, labeled with dbLabel and the parameterized SQL
// query template (placeholders only, no bound values - read from
// Statement.SQL, which GORM builds separately from Statement.Vars). This
// exists specifically so that slow queries or connection contention show up
// directly as a latency metric instead of requiring manual diagnosis.
func registerQueryDurationCallbacks(gdb *gorm.DB, dbLabel string) {
	before := func(tx *gorm.DB) {
		tx.Statement.Settings.Store(queryStartSetting, time.Now())
	}
	after := func(operation string) func(tx *gorm.DB) {
		return func(tx *gorm.DB) {
			v, ok := tx.Statement.Settings.Load(queryStartSetting)
			if !ok {
				return
			}
			start, ok := v.(time.Time)
			if !ok {
				return
			}
			query := tx.Statement.SQL.String()
			if query == "" {
				query = "unknown"
			} else {
				query = normalizeQueryLabel(query)
			}
			metrics.QueryDuration.WithLabelValues(dbLabel, operation, query).Observe(time.Since(start).Seconds())
		}
	}

	// Each operation is registered explicitly (rather than in a loop) since
	// the processor/callback types returned by Callback().Create() etc. are
	// unexported, so they can't be stored generically across operation types.
	_ = gdb.Callback().Create().Before("gorm:create").Register("metrics:before_create", before)
	_ = gdb.Callback().Create().After("gorm:create").Register("metrics:after_create", after("create"))

	_ = gdb.Callback().Query().Before("gorm:query").Register("metrics:before_query", before)
	_ = gdb.Callback().Query().After("gorm:query").Register("metrics:after_query", after("query"))

	_ = gdb.Callback().Update().Before("gorm:update").Register("metrics:before_update", before)
	_ = gdb.Callback().Update().After("gorm:update").Register("metrics:after_update", after("update"))

	_ = gdb.Callback().Delete().Before("gorm:delete").Register("metrics:before_delete", before)
	_ = gdb.Callback().Delete().After("gorm:delete").Register("metrics:after_delete", after("delete"))

	_ = gdb.Callback().Row().Before("gorm:row").Register("metrics:before_row", before)
	_ = gdb.Callback().Row().After("gorm:row").Register("metrics:after_row", after("row"))

	_ = gdb.Callback().Raw().Before("gorm:raw").Register("metrics:before_raw", before)
	_ = gdb.Callback().Raw().After("gorm:raw").Register("metrics:after_raw", after("raw"))
}
