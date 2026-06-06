package main

import (
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-co-op/gocron"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/handlers"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

func main() {

	klog.InitFlags(nil)
	flag.Set("logtostderr", "true")
	flag.Set("stderrthreshold", "INFO")
	flag.Set("v", "2")
	flag.Parse()
	klog.Flush()

	e := echo.New()

	config := podcast.Config{
		FileHome: "/data",
	}

	userDataDir := filepath.Join(config.FileHome, handlers.UserDataPath)
	if _, err := os.Stat(userDataDir); errors.Is(err, os.ErrNotExist) {
		if err := os.Mkdir(userDataDir, 0764); err != nil {
			klog.Fatalf("error creating user data path: %s", err)
		}
	}

	db, err := podcast.InitDB(filepath.Join(config.FileHome, "podcasts.db"))
	if err != nil {
		klog.Fatalf("error initializing database: %s", err)
	}

	pw := podcast.NewPodcastWatcher(config, db)
	pw.Run(config)
	klog.Infof("started podcast watcher")
	defer pw.Stop()

	h := handlers.New(config, &pw, db)
	h.Register(e)

	s := gocron.NewScheduler(time.UTC)
	if _, err = s.Every(10).Minutes().Do(h.EnqueueAll); err != nil {
		klog.Errorf("error setting up cron job refresh: %s", err)
	}
	s.StartAsync()

	e.Static("/", "static")

	if err := e.Start(":8080"); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

