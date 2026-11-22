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
	"strings"

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

// upsert copies every row of model T from src to dst, in-place overwriting
// any existing row with the same primary key (ON CONFLICT DO UPDATE) so the
// tool is safely re-runnable if it's interrupted partway through.
//
// It paginates using keyset ("seek method") pagination - WHERE (pkCols) >
// (last seen values) ORDER BY pkCols LIMIT batchSize - rather than GORM's
// built-in FindInBatches, which pages via LIMIT/OFFSET. OFFSET-based
// pagination has a well-known failure mode: it re-executes a fresh query
// per batch, and if any batch happens to return fewer than batchSize rows
// before the true end of the table (observed in practice against SQLite
// here), FindInBatches treats that as the final batch and stops silently,
// well short of the actual row count - no error, no stall, just missing
// data in the destination, surfaced only indirectly if a count comparison
// is extremely careful. Keyset pagination can't repeat or skip rows: each
// page is strictly "rows after the last primary key we saw", so it only
// stops when a page is genuinely empty.
//
// pkCols are column names forming the primary key, in a stable sort order.
// pkOf extracts those same column values (in the same order) from a row, for
// building the next page's WHERE clause.
func upsert[T any](src, dst *gorm.DB, label string, pkCols []string, pkOf func(T) []any) error {
	var total int64
	var lastPK []any
	placeholder := fmt.Sprintf("(%s) > (%s)", strings.Join(pkCols, ", "), strings.TrimSuffix(strings.Repeat("?,", len(pkCols)), ","))
	for {
		q := src.Session(&gorm.Session{}).Model(new(T)).Order(strings.Join(pkCols, ", ")).Limit(batchSize)
		if lastPK != nil {
			q = q.Where(placeholder, lastPK...)
		}
		var batch []T
		if err := q.Find(&batch).Error; err != nil {
			return fmt.Errorf("read page: %w", err)
		}
		if len(batch) == 0 {
			break
		}
		if err := dst.Clauses(clause.OnConflict{UpdateAll: true}).CreateInBatches(&batch, batchSize).Error; err != nil {
			return fmt.Errorf("write page: %w", err)
		}
		total += int64(len(batch))
		log.Printf("%s: copied %d rows so far", label, total)
		lastPK = pkOf(batch[len(batch)-1])
		if len(batch) < batchSize {
			break
		}
	}
	log.Printf("%s: done, %d rows total", label, total)
	return nil
}

func copyPodcasts(src, dst *gorm.DB) error {
	return upsert(src, dst, "podcasts", []string{"id"}, func(p podcast.Podcast) []any {
		return []any{p.Id}
	})
}

func copyEpisodes(src, dst *gorm.DB) error {
	return upsert(src, dst, "episodes", []string{"podcast_id", "id"}, func(e podcast.Episode) []any {
		return []any{e.PodcastID, e.Id}
	})
}

func copyJobs(src, dst *gorm.DB) error {
	return upsert(src, dst, "jobs", []string{"id"}, func(j podcast.Job) []any {
		return []any{j.ID}
	})
}

func copyFingerprints(src, dst *gorm.DB) error {
	err := upsert(src, dst, "episode_fingerprints", []string{"id"}, func(f podcast.EpisodeFingerprint) []any {
		return []any{f.ID}
	})
	if err != nil {
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
