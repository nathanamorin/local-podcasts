package podcast

import (
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"k8s.io/klog/v2"
)

func InitDB(dbPath string) (*gorm.DB, error) {
	// Use :memory: as-is; otherwise check whether the file already exists.
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

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	if err = db.AutoMigrate(&Podcast{}, &Episode{}); err != nil {
		return nil, err
	}

	return db, nil
}
