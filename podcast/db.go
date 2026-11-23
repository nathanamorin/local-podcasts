package podcast

import (
	"fmt"
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

	if err = db.AutoMigrate(&Podcast{}, &Episode{}, &Job{}, &EpisodeFingerprint{}, &AdSegment{}); err != nil {
		return nil, fmt.Errorf("automigrate: %w", err)
	}

	registerQueryDurationCallbacks(db, "primary")

	return db, nil
}

// queryStartSetting is the key used to pass the operation's start time from
// a callback's "before" hook to its "after" hook via Statement.Settings
// (a sync.Map scoped to a single GORM operation, cleared for the next one).
const queryStartSetting = "metrics:query_start"

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
