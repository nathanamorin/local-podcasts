// Package metrics exposes Prometheus metrics for local-podcasts. Metrics are
// registered against the default Prometheus registry and served over HTTP at
// /metrics (see handlers.Handler.Metrics), where they're scraped by the
// cluster's Grafana Alloy agent via the ServiceMonitor in deployment/deployment.yaml.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// EpisodeDownloadStatus labels the outcome of an episode audio download
// attempt, used as the "status" label on EpisodeDownloadsTotal.
type EpisodeDownloadStatus string

const (
	EpisodeDownloadSuccess EpisodeDownloadStatus = "success"
	EpisodeDownloadFailure EpisodeDownloadStatus = "failure"
)

// EpisodeDownloadsTotal counts episode audio download attempts, partitioned
// by podcast and outcome (success/failure), so dashboards and alerts can
// track download reliability per-podcast over time.
var EpisodeDownloadsTotal = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Name: "local_podcasts_episode_downloads_total",
		Help: "Total number of podcast episode audio download attempts, by podcast and outcome (success/failure).",
	},
	[]string{"podcast", "status"},
)

// RecordEpisodeDownload increments the download counter for the given
// podcast name and outcome.
func RecordEpisodeDownload(podcastName string, status EpisodeDownloadStatus) {
	EpisodeDownloadsTotal.WithLabelValues(podcastName, string(status)).Inc()
}

// PendingJobsGauge, ProcessingJobsGauge, FailedJobsGauge, and DoneJobsGauge
// track the background job queue (episode downloads + fingerprinting,
// performed by separate worker pods) by job type, so dashboards/alerts and
// the KEDA autoscaler can observe backlog depth and throughput. These are
// refreshed on a periodic background ticker (see podcast.RefreshJobGauges,
// scheduled from cmd/server/main.go) rather than updated incrementally or
// on each scrape, since they reflect current DB state but must not make
// /metrics latency (and therefore scrape reliability) depend on how
// contended the jobs table happens to be at scrape time.
var PendingJobsGauge = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "local_podcasts_pending_jobs",
		Help: "Number of jobs currently pending, by job type.",
	},
	[]string{"type"},
)

var ProcessingJobsGauge = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "local_podcasts_processing_jobs",
		Help: "Number of jobs currently claimed/processing by a worker, by job type.",
	},
	[]string{"type"},
)

var FailedJobsGauge = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "local_podcasts_failed_jobs",
		Help: "Number of jobs that exhausted their retry attempts, by job type.",
	},
	[]string{"type"},
)

var DoneJobsGauge = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "local_podcasts_done_jobs",
		Help: "Number of jobs that have completed successfully, by job type.",
	},
	[]string{"type"},
)

// QueryDuration tracks how long each database operation takes, split by
// which connection pool served it ("write" - the single serialized
// SetMaxOpenConns(1) connection used for all mutations and most reads, or
// "read" - the pooled, query_only InitReadOnlyDB connections), by GORM
// operation type (create/query/update/delete/row/raw), and by the
// parameterized SQL query template it ran (e.g. "SELECT * FROM `episodes`
// WHERE `podcast_id` = ? AND `id` = ?" - the placeholder form built by
// GORM, never substituted with actual bound values, to avoid unbounded
// label cardinality from parameter data). This is what would have
// surfaced the writer-connection contention bug (episode-stream lookups
// queueing for minutes behind job-claim traffic) directly as a latency
// metric, instead of requiring manual wget/dd diagnosis.
var QueryDuration = promauto.NewHistogramVec(
	prometheus.HistogramOpts{
		Name: "local_podcasts_db_query_duration_seconds",
		Help: "Duration of database operations, by connection pool (write/read), GORM operation type, and parameterized query template (no bound parameter values).",
		// Wide range: normal queries complete in well under a millisecond,
		// but the bug this is meant to catch stalled for minutes.
		Buckets: prometheus.ExponentialBuckets(0.0001, 4, 14), // ~0.1ms .. ~7 minutes
	},
	[]string{"db", "operation", "query"},
)
