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
	}

	// busy_timeout: retry for up to 10s before returning SQLITE_BUSY.
	// _journal_mode=WAL: allows concurrent readers alongside one writer.
	// _txlock=immediate: acquire write lock upfront to avoid deadlocks.
	dsn := dbPath + "?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=txlock(immediate)"
	if dbPath == ":memory:" {
		dsn = dbPath
	}

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	// Serialize writes through a single connection; reads can use more.
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)

	if err = db.AutoMigrate(&Podcast{}, &Episode{}); err != nil {
		return nil, err
	}

	return db, nil
}
