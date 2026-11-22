package podcast

import (
	"net/url"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"k8s.io/klog/v2"
)

// maxOpenConns bounds how many concurrent physical SQLite connections the
// pool may hand out for a file-backed DB. SQLite still only allows one
// writer at a time (writes beyond that block on busy_timeout below), but in
// WAL mode readers don't block the writer or each other, so this lets
// cheap, frequent reads (e.g. the /metrics job-count queries) run
// concurrently with the app's write-heavy RSS sync instead of queuing
// behind it on a single shared connection.
const maxOpenConns = 4

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
		sqlDB.SetMaxOpenConns(maxOpenConns)
		sqlDB.SetMaxIdleConns(maxOpenConns)
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
