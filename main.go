package main

import (
	"encoding/json"
	"flag"
	"github.com/go-co-op/gocron"
	"github.com/golang/glog"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"log"
	"net/http"
	"time"
)

type podcastList struct {
	Podcasts []podcast.Podcast `json:"podcasts"`
}

func main() {

	flag.Parse()
	glog.Info("Info level")
	glog.Error("Error level")
	glog.Flush()

	e := echo.New()

	config := podcast.Config{
		FileHome: "/data",
	}

	pw := podcast.NewPodcastWatcher()

	pw.Run(config)
	glog.Infof("started podcast watcher")
	defer pw.Stop()

	podcasts, err := podcast.ListPodcasts(config)

	if err != nil {
		glog.Errorf("error listing podcasts on start: %s", err)
	} else {
		for _, p := range podcasts {
			pw.EnqueuePodcast(p)
		}
	}

	s := gocron.NewScheduler(time.UTC)

	_, err = s.Every(1).Hour().Do(func() {

		podcasts, err := podcast.ListPodcasts(config)

		if err != nil {
			glog.Errorf("error listing podcasts on refresh: %s", err)
		} else {
			for _, p := range podcasts {
				pw.EnqueuePodcast(p)
			}
		}

	})

	if err != nil {
		glog.Errorf("error setting up cron job refresh: %s", err)
	}

	s.StartAsync()

	if err != nil {
		return
	}
	e.GET("/podcasts", func(c echo.Context) error {

		podcasts, err := podcast.ListPodcasts(config)

		if err != nil {
			glog.Errorf("error listing podcasts: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error listing podcasts\"}")
		}

		return c.JSON(http.StatusOK, podcastList{
			Podcasts: podcasts,
		})
	})

	e.POST("/podcasts", func(c echo.Context) error {

		jsonData := make(map[string]interface{})
		err := json.NewDecoder(c.Request().Body).Decode(&jsonData)
		if err != nil {
			glog.Errorf("error reading json request: %s", err)
			return c.String(http.StatusBadRequest, "{\"error\": \"invalid request\"}")
		}

		if rssUrl, ok := jsonData["rss_url"]; ok {
			podcastData, err := podcast.AddPodcast(config, rssUrl.(string))
			if err != nil {
				glog.Errorf("error processing podcast rss url %s: %s", rssUrl.(string), err)
				return c.String(http.StatusBadRequest, "{\"error\": \"error processing podcast rss url\"}")
			}

			return c.JSON(http.StatusOK, podcastData)

		} else {
			glog.Errorf("error reading json request missing rss_url: %s", err)
			return c.String(http.StatusBadRequest, "{\"error\": \"rss_url must be provided in json request body\"}")
		}
	})

	e.GET("/podcasts/:podcast_id", func(c echo.Context) error {

		podcastData, err := podcast.GetPodcast(config, c.Param("podcast_id"))

		if err != nil {
			glog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		return c.JSON(http.StatusOK, podcastData)
	})

	e.GET("/podcasts/:podcast_id/image", func(c echo.Context) error {

		podcastData, err := podcast.GetPodcast(config, c.Param("podcast_id"))

		if err != nil {
			glog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		data, mimeType, err := podcastData.GetImage(config)

		if err != nil {
			glog.Errorf("error getting image: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting image\"}")
		}

		c.Response().Status = http.StatusOK
		c.Response().Header().Add(echo.HeaderContentType, mimeType)
		_, err = c.Response().Write(data)
		return err
	})

	e.GET("/podcasts/:podcast_id/update", func(c echo.Context) error {

		podcastData, err := podcast.GetPodcast(config, c.Param("podcast_id"))
		if err != nil {
			glog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}
		err = podcastData.Update(config)

		if err != nil {
			glog.Errorf("error updating podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error updating podcast\"}")
		}

		return c.JSON(http.StatusOK, podcastData)
	})

	e.GET("/podcasts/:podcast_id/episodes/:episode_id/stream", func(c echo.Context) error {

		podcastData, err := podcast.GetPodcast(config, c.Param("podcast_id"))

		if err != nil {
			glog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		filePath, err := podcastData.GetAudioFile(config, c.Param("episode_id"))

		if err != nil {
			glog.Errorf("error getting stream: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting stream\"}")
		}

		c.Response().Status = http.StatusOK
		http.ServeFile(c.Response().Writer, c.Request(), filePath)
		return nil
	})

	e.Static("/", "static")

	if err := e.Start(":8080"); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
