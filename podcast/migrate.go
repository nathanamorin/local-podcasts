package podcast

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"

	"gorm.io/gorm"
	"k8s.io/klog/v2"
)

const podcastInfoFilename = "info.json"

// MigrateFromFiles reads legacy info.json files from the data directory and
// imports them into SQLite. It is a no-op if the podcasts table already has rows.
func MigrateFromFiles(config Config, db *gorm.DB) error {
	var count int64
	if err := db.Model(&Podcast{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		klog.Infof("migration: podcasts table already has %d rows, skipping file migration", count)
		return nil
	}

	isAlphanumeric := regexp.MustCompile(`^[a-z0-9]+$`).MatchString

	entries, err := ioutil.ReadDir(config.FileHome)
	if err != nil {
		return err
	}

	migrated := 0
	for _, entry := range entries {
		if !entry.IsDir() || !isAlphanumeric(entry.Name()) {
			continue
		}

		infoPath := filepath.Join(config.FileHome, entry.Name(), podcastInfoFilename)
		if _, err := os.Stat(infoPath); os.IsNotExist(err) {
			continue
		}

		data, err := ioutil.ReadFile(infoPath)
		if err != nil {
			klog.Errorf("migration: error reading %s: %s", infoPath, err)
			continue
		}

		p := NewPodcastObj()
		if err := json.Unmarshal(data, &p); err != nil {
			klog.Errorf("migration: error parsing %s: %s", infoPath, err)
			continue
		}

		for _, ep := range p.Episodes {
			ep.PodcastID = p.Id
		}

		result := db.Session(&gorm.Session{FullSaveAssociations: true}).Save(&p)
		if result.Error != nil {
			klog.Errorf("migration: error saving podcast %s: %s", p.Name, result.Error)
			continue
		}

		klog.Infof("migration: imported podcast %q (%d episodes)", p.Name, len(p.Episodes))
		migrated++
	}

	klog.Infof("migration: completed, imported %d podcasts", migrated)
	return nil
}
