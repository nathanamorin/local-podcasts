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
