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
	FileHome string `conf:"default:/data,help:directory for podcast audio files and images"`
	DBPath   string `conf:"help:path to the SQLite database file (defaults to <file-home>/podcasts.db)"`
	Addr     string `conf:"default::8080,help:listen address for the HTTP server"`
}

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

	// Default DB path to <file-home>/podcasts.db if not explicitly set.
	if cfg.DBPath == "" {
		cfg.DBPath = filepath.Join(cfg.FileHome, "podcasts.db")
	}

	klog.Infof("starting local-podcasts build[%s] file-home[%s] db[%s] addr[%s]",
		build, cfg.FileHome, cfg.DBPath, cfg.Addr)

	podcastConfig := podcast.Config{FileHome: cfg.FileHome}

	userDataDir := filepath.Join(cfg.FileHome, handlers.UserDataPath)
	if _, err := os.Stat(userDataDir); errors.Is(err, os.ErrNotExist) {
		if err := os.Mkdir(userDataDir, 0764); err != nil {
			klog.Fatalf("error creating user data path: %s", err)
		}
	}

	db, err := podcast.InitDB(cfg.DBPath)
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

	s := gocron.NewScheduler(time.UTC)
	if _, err = s.Every(10).Minutes().Do(h.EnqueueAll); err != nil {
		klog.Errorf("error setting up cron job refresh: %s", err)
	}
	s.StartAsync()

	e.Static("/", "static")

	if err := e.Start(cfg.Addr); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

