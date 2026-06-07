package podcast

import (
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"k8s.io/klog/v2"
)

func InitDB(dbPath string) (*gorm.DB, error) {
	if dbPath != ":memory:" {
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
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	// Serialize all connections through one handle so concurrent goroutines
	// never contend at the driver level.
	sqlDB.SetMaxOpenConns(1)

	// Apply pragmas explicitly — more reliable than DSN query params.
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA busy_timeout=10000",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA wal_checkpoint(TRUNCATE)", // clear any leftover WAL from a previous run
	}
	for _, p := range pragmas {
		if err = db.Exec(p).Error; err != nil {
			return nil, err
		}
	}

	if err = db.AutoMigrate(&Podcast{}, &Episode{}); err != nil {
		return nil, err
	}

	return db, nil
}
