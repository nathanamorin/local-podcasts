// Command migrate-sqlite-to-postgres is a one-off tool that copies all data
// from the pre-migration SQLite database file into the new PostgreSQL
// database, preserving primary keys. It's meant to be run once, as a
// Kubernetes Job, with the main app scaled to 0 replicas (no writers may be
// active against the SQLite file during the copy - this tool opens it
// read-only, but concurrent app writes could still be missed).
//
// Usage:
//
//	migrate-sqlite-to-postgres -sqlite /data/ssd/podcasts.db -postgres "postgres://user:pass@host:5432/dbname?sslmode=disable"
package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/glebarez/sqlite"
	"github.com/nathanamorin/local-podcasts/podcast"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

const batchSize = 500

func main() {
	sqlitePath := flag.String("sqlite", "", "path to the source SQLite database file")
	postgresDSN := flag.String("postgres", "", "destination PostgreSQL connection string")
	flag.Parse()

	if *sqlitePath == "" || *postgresDSN == "" {
		log.Fatal("both -sqlite and -postgres are required")
	}

	src, err := gorm.Open(sqlite.Open(*sqlitePath+"?_pragma=query_only(1)"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("open source sqlite db: %s", err)
	}

	// InitDB also runs AutoMigrate, creating the schema if this is a brand
	// new Postgres database.
	dst, err := podcast.InitDB(*postgresDSN, 4)
	if err != nil {
		log.Fatalf("open destination postgres db: %s", err)
	}

	if err := copyPodcasts(src, dst); err != nil {
		log.Fatalf("copy podcasts: %s", err)
	}
	if err := copyEpisodes(src, dst); err != nil {
		log.Fatalf("copy episodes: %s", err)
	}
	if err := copyJobs(src, dst); err != nil {
		log.Fatalf("copy jobs: %s", err)
	}
	if err := copyFingerprints(src, dst); err != nil {
		log.Fatalf("copy episode fingerprints: %s", err)
	}

	if err := verifyCounts(src, dst); err != nil {
		log.Fatalf("verification failed: %s", err)
	}

	log.Println("migration completed successfully")
}

// upsert copies every row of model T from src to dst in batches, in-place
// overwriting any existing row with the same primary key (ON CONFLICT DO
// UPDATE) so the tool is safely re-runnable if it's interrupted partway
// through.
func upsert[T any](src, dst *gorm.DB, label string) error {
	var total int64
	err := src.Session(&gorm.Session{}).Model(new(T)).FindInBatches(&[]T{}, batchSize, func(tx *gorm.DB, batchNum int) error {
		rows, ok := tx.Statement.Dest.(*[]T)
		if !ok || len(*rows) == 0 {
			return nil
		}
		if err := dst.Clauses(clause.OnConflict{UpdateAll: true}).CreateInBatches(rows, batchSize).Error; err != nil {
			return fmt.Errorf("write batch %d: %w", batchNum, err)
		}
		total += int64(len(*rows))
		log.Printf("%s: copied %d rows so far", label, total)
		return nil
	}).Error
	if err != nil {
		return err
	}
	log.Printf("%s: done, %d rows total", label, total)
	return nil
}

func copyPodcasts(src, dst *gorm.DB) error {
	return upsert[podcast.Podcast](src, dst, "podcasts")
}

func copyEpisodes(src, dst *gorm.DB) error {
	return upsert[podcast.Episode](src, dst, "episodes")
}

func copyJobs(src, dst *gorm.DB) error {
	return upsert[podcast.Job](src, dst, "jobs")
}

func copyFingerprints(src, dst *gorm.DB) error {
	if err := upsert[podcast.EpisodeFingerprint](src, dst, "episode_fingerprints"); err != nil {
		return err
	}
	// Explicit IDs were preserved during the copy, so Postgres' auto-
	// increment sequence hasn't advanced past them - without this, the
	// first fingerprint row the app creates post-cutover would collide
	// with an already-migrated ID.
	return dst.Exec(`SELECT setval(pg_get_serial_sequence('episode_fingerprints', 'id'), COALESCE((SELECT MAX(id) FROM episode_fingerprints), 1))`).Error
}

func verifyCounts(src, dst *gorm.DB) error {
	check := func(label string, model interface{}) error {
		var srcCount, dstCount int64
		if err := src.Model(model).Count(&srcCount).Error; err != nil {
			return fmt.Errorf("count source %s: %w", label, err)
		}
		if err := dst.Model(model).Count(&dstCount).Error; err != nil {
			return fmt.Errorf("count destination %s: %w", label, err)
		}
		if srcCount != dstCount {
			return fmt.Errorf("%s: source has %d rows, destination has %d", label, srcCount, dstCount)
		}
		log.Printf("%s: verified %d rows match", label, srcCount)
		return nil
	}

	if err := check("podcasts", &podcast.Podcast{}); err != nil {
		return err
	}
	if err := check("episodes", &podcast.Episode{}); err != nil {
		return err
	}
	if err := check("jobs", &podcast.Job{}); err != nil {
		return err
	}
	if err := check("episode_fingerprints", &podcast.EpisodeFingerprint{}); err != nil {
		return err
	}
	return nil
}
