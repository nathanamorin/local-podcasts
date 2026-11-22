package podcast

import (
	"net/url"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"k8s.io/klog/v2"
)

// DefaultReadOnlyMaxOpenConns is the recommended maxOpenConns for
// InitReadOnlyDB when the caller has no specific reason to override it.
const DefaultReadOnlyMaxOpenConns = 4

func InitDB(dbPath string) (*gorm.DB, error) {
	dsn := dbPath
	isFileBacked := dbPath != ":memory:"

	if isFileBacked {
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			klog.Infof("database file not found at %s, creating new database", dbPath)
			f, err := os.Create(dbPath)
			if err != nil {
				return nil, err
			}
			f.Close()
		} else {
			klog.Infof("opening existing database at %s", dbPath)
		}

		// Remove stale WAL/SHM files that can cause SQLITE_BUSY on startup
		// if the previous process was killed uncleanly.
		for _, ext := range []string{"-wal", "-shm"} {
			_ = os.Remove(dbPath + ext)
		}

		// Apply pragmas via DSN query params (rather than a one-time
		// db.Exec after Open) so EVERY connection the pool opens gets them
		// - not just whichever single connection happened to service that
		// Exec call. This is what makes it safe to raise MaxOpenConns above
		// 1: without this, additional pooled connections would silently
		// come up without WAL/busy_timeout and could hit "database is
		// locked" errors under concurrency.
		pragmas := url.Values{
			"_pragma": []string{
				"journal_mode(WAL)",
				"busy_timeout(10000)",
				"synchronous(NORMAL)",
			},
		}
		dsn = dbPath + "?" + pragmas.Encode()
	}

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	if isFileBacked {
		// Writes must stay serialized - SQLite only allows one writer at a
		// time, and with enough concurrent writers (e.g. a KEDA-scaled
		// worker fleet) allowing >1 connection here just moves contention
		// from Go's connection-acquisition queue (always eventually
		// succeeds) into SQLite's own locking (fails outright with
		// SQLITE_BUSY once busy_timeout is exceeded). Concurrent read
		// capacity for things like /metrics comes from InitReadOnlyDB
		// instead, which doesn't contend with the writer under WAL.
		sqlDB.SetMaxOpenConns(1)
	} else {
		// A ":memory:" DSN gives each new physical connection its own
		// independent, empty in-memory database - multiple connections
		// would not share data, so this must stay pinned to exactly one.
		sqlDB.SetMaxOpenConns(1)
	}

	// One-time startup cleanup, not a persistent pragma, so it's fine to
	// run once against whichever connection services it.
	if isFileBacked {
		if err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)").Error; err != nil {
			return nil, err
		}
	}

	if err = db.AutoMigrate(&Podcast{}, &Episode{}, &Job{}, &EpisodeFingerprint{}); err != nil {
		return nil, err
	}

	return db, nil
}

// InitReadOnlyDB opens a second connection pool against the same database,
// intended only for cheap, latency-sensitive read-only queries (currently:
// the /metrics job-queue gauge refresh) that must not queue behind the
// app's single serialized writer connection (see InitDB). Connections are
// marked query_only so a bug can't accidentally turn this into a second
// writer and reintroduce SQLITE_BUSY contention. maxOpenConns bounds how
// many of these read-only connections may run concurrently - since none of
// them ever write, this can safely be raised without risking writer
// contention (WAL readers see a consistent snapshot without blocking on,
// or being blocked by, the writer); callers with no specific reason to
// override it should pass DefaultReadOnlyMaxOpenConns.
//
// For ":memory:" dbPath (tests), a second connection would open its own
// independent, empty database, so writeDB is returned directly instead -
// tests exercising RefreshJobGauges share the single in-memory connection
// just like before this split existed.
func InitReadOnlyDB(dbPath string, writeDB *gorm.DB, maxOpenConns int) (*gorm.DB, error) {
	if dbPath == ":memory:" {
		return writeDB, nil
	}

	pragmas := url.Values{
		"_pragma": []string{
			"busy_timeout(10000)",
			"query_only(1)",
		},
	}
	dsn := dbPath + "?" + pragmas.Encode()

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxOpenConns)

	return db, nil
}
