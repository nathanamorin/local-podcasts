package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/ardanlabs/conf/v3"
	"github.com/go-co-op/gocron"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/handlers"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

var build = "develop"

type appConfig struct {
	FileHome       string `conf:"default:/data,help:directory for podcast audio files and images"`
	DBDSN          string `conf:"help:PostgreSQL connection string, e.g. postgres://user:password@host:5432/dbname?sslmode=disable (required)"`
	Addr           string `conf:"default::8080,help:listen address for the public HTTP server"`
	InternalAddr   string `conf:"default::8081,help:listen address for the internal worker job API"`
	DBMaxOpenConns int    `conf:"default:20,help:max concurrent connections in the Postgres connection pool (see podcast.InitDB)"`
}

// @title           local-podcasts API
// @version         1.0
// @description     API for managing self-hosted podcast subscriptions, episode downloads, and streaming.
// @license.name    MIT

// @BasePath  /
func main() {

	cfg := appConfig{}
	help, err := conf.Parse("LOCAL_PODCASTS", &cfg)
	if err != nil {
		if errors.Is(err, conf.ErrHelpWanted) {
			fmt.Println(help)
			os.Exit(0)
		}
		log.Fatalf("parsing config: %s", err)
	}

	if cfg.DBDSN == "" {
		log.Fatalf("LOCAL_PODCASTS_DB_DSN is required (PostgreSQL connection string)")
	}

	klog.Infof("starting local-podcasts build[%s] file-home[%s] addr[%s] internal-addr[%s]",
		build, cfg.FileHome, cfg.Addr, cfg.InternalAddr)

	podcastConfig := podcast.Config{FileHome: cfg.FileHome}

	if err := os.MkdirAll(cfg.FileHome, 0764); err != nil {
		klog.Fatalf("error creating file home directory: %s", err)
	}

	userDataDir := filepath.Join(cfg.FileHome, handlers.UserDataPath)
	if _, err := os.Stat(userDataDir); errors.Is(err, os.ErrNotExist) {
		if err := os.Mkdir(userDataDir, 0764); err != nil {
			klog.Fatalf("error creating user data path: %s", err)
		}
	}

	db, err := podcast.InitDB(cfg.DBDSN, cfg.DBMaxOpenConns)
	if err != nil {
		klog.Fatalf("error initializing database: %s", err)
	}

	if err := podcast.MigrateFromFiles(podcastConfig, db); err != nil {
		klog.Errorf("error running file migration: %s", err)
	}

	pw := podcast.NewPodcastWatcher(podcastConfig, db)
	pw.Run(podcastConfig)
	klog.Infof("started podcast watcher")
	defer pw.Stop()

	e := echo.New()

	h := handlers.New(podcastConfig, &pw, db)
	h.Register(e)

	// The internal worker job API is served on a separate port/listener so
	// it can be exposed only via a cluster-internal Service, never through
	// the public Ingress — see handlers.RegisterInternal.
	internalEcho := echo.New()
	h.RegisterInternal(internalEcho)
	go func() {
		if err := internalEcho.Start(cfg.InternalAddr); err != nil && err != http.ErrServerClosed {
			klog.Fatalf("internal API server error: %s", err)
		}
	}()

	s := gocron.NewScheduler(time.UTC)
	if _, err = s.Every(10).Minutes().Do(h.EnqueueAll); err != nil {
		klog.Errorf("error setting up cron job refresh: %s", err)
	}
	s.StartAsync()

	// Serve static files and fall back to index.html for SPA client-side routes.
	e.GET("/*", func(c echo.Context) error {
		p := filepath.Join("static", c.Param("*"))
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return c.File(p)
		}
		return c.File("static/index.html")
	})

	if err := e.Start(cfg.Addr); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
