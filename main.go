package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-co-op/gocron"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/podcast"
	"k8s.io/klog/v2"
)

type podcastList struct {
	Podcasts []podcast.Podcast `json:"podcasts"`
}

const userDataPath = "user_data"

func clientInfo(config podcast.Config, c echo.Context) (string, string) {
	token := strings.Replace(c.Request().Header.Get("Authorization"), "Basic ", "", 1)
	key := c.Param("key-id")

	hashedToken := fmt.Sprintf("%x", sha256.Sum256([]byte(token+key)))

	filePath := filepath.Join(config.FileHome, userDataPath, hashedToken)

	return key, filePath
}

func refresh(pw *podcast.PodcastWatcher) {
	if !pw.QueueEmpty() {
		klog.Infof("podcasts still in update queue, skipping cron update")
		return
	}

	podcasts, err := pw.ListPodcasts()

	if err != nil {
		klog.Errorf("error listing podcasts on refresh: %s", err)
	} else {
		for _, p := range podcasts {
			pw.EnqueuePodcast(p)
		}
	}
}

func configureStaticResponse(resp *echo.Response) {
	resp.Header().Set("Cache-Control", "max-age=604800")
}

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
	userDataDir := filepath.Join(config.FileHome, userDataPath)
	if _, err := os.Stat(userDataDir); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(userDataDir, 0764)
		if err != nil {
			klog.Fatalf("error creating user data path: %s", err)
		}
	}

	pw := podcast.NewPodcastWatcher(config)

	pw.Run(config)
	klog.Infof("started podcast watcher")
	defer pw.Stop()

	s := gocron.NewScheduler(time.UTC)

	_, err := s.Every(1).Hour().Do(func() {

		refresh(&pw)

	})

	if err != nil {
		klog.Errorf("error setting up cron job refresh: %s", err)
	}

	s.StartAsync()

	if err != nil {
		return
	}

	e.GET("/refresh", func(c echo.Context) error {
		refresh(&pw)
		return c.JSON(http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	e.GET("/podcasts", func(c echo.Context) error {

		podcasts, err := pw.ListPodcasts()

		for idx, _ := range podcasts {
			podcasts[idx].Episodes = nil
		}

		if err != nil {
			klog.Errorf("error listing podcasts: %s", err)
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
			klog.Errorf("error reading json request: %s", err)
			return c.String(http.StatusBadRequest, "{\"error\": \"invalid request\"}")
		}

		if rssUrl, ok := jsonData["rss_url"]; ok {
			podcastData, err := podcast.AddPodcast(config, rssUrl.(string))
			if err != nil {
				klog.Errorf("error processing podcast rss url %s: %s", rssUrl.(string), err)
				return c.String(http.StatusBadRequest, "{\"error\": \"error processing podcast rss url\"}")
			}

			pw.EnqueuePodcast(*podcastData)

			return c.JSON(http.StatusOK, podcastData)

		} else {
			klog.Errorf("error reading json request missing rss_url: %s", err)
			return c.String(http.StatusBadRequest, "{\"error\": \"rss_url must be provided in json request body\"}")
		}
	})

	e.GET("/podcasts/:podcast_id", func(c echo.Context) error {

		podcastData, err := pw.GetPodcast(c.Param("podcast_id"))

		if err != nil {
			klog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		return c.JSON(http.StatusOK, podcastData)
	})

	e.GET("/podcasts/:podcast_id/image", func(c echo.Context) error {

		podcastData, err := pw.GetPodcast(c.Param("podcast_id"))

		if err != nil {
			klog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		imagePath := podcastData.GetImage(config)

		if err != nil {
			klog.Errorf("error getting image: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting image\"}")
		}

		c.Response().Status = http.StatusOK
		configureStaticResponse(c.Response())
		http.ServeFile(c.Response().Writer, c.Request(), imagePath)
		return nil
	})

	e.GET("/podcasts/:podcast_id/episodes/:episode_id/stream", func(c echo.Context) error {

		podcastData, err := pw.GetPodcast(c.Param("podcast_id"))

		if err != nil {
			klog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		filePath, err := podcastData.GetAudioFile(config, c.Param("episode_id"))

		if err != nil {
			klog.Errorf("error getting stream: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting stream\"}")
		}

		c.Response().Status = http.StatusOK
		http.ServeFile(c.Response().Writer, c.Request(), filePath)
		return nil
	})

	e.GET("/rss/all", func(c echo.Context) error {

		podcasts, err := pw.ListPodcasts()

		if err != nil {
			klog.Errorf("error getting podcast: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting podcast\"}")
		}

		host := c.Request().Header.Get("X-Forwarded-Host")
		scheme := c.Request().Header.Get("X-Forwarded-Proto")

		if host == "" {
			host = c.Request().Host
		}
		if scheme == "" {
			scheme = c.Request().URL.Scheme
		}
		if scheme == "" {
			scheme = "http"
		}

		rss, err := podcast.RenderPodcasts(podcasts, scheme+"://"+host)

		if err != nil {
			klog.Errorf("error getting rss feed: %s", err)
			return c.String(http.StatusInternalServerError, "{\"error\": \"error getting rss feed\"}")
		}

		return c.Blob(200, "application/rss+xml", []byte(rss))
	})

	// These status endpoints are not intended to provide secure user data management.  The only data stored
	// by these APIs are podcast status, played, etc. & in the intended local network environment, a simple shared
	// token is used that is generated by the client & stored in local client storage.  If lost, this client token
	// can't be recovered from the server side.
	e.GET("/client-status/:key-id", func(c echo.Context) error {

		key, filePath := clientInfo(config, c)

		if _, err := os.Stat(filePath); errors.Is(err, os.ErrNotExist) {
			return c.JSONBlob(http.StatusNotFound, []byte("{\"error\": \"key not found\"}"))
		} else if err != nil {
			klog.Errorf("error fetching client status key %s: %s", key, err)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}

		c.Response().Status = http.StatusOK

		imageFile, err := os.Open(filePath)
		if err != nil {
			klog.Errorf("error opening client status key %s: %s", key, err)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}
		defer imageFile.Close()

		byteValue, err := ioutil.ReadAll(imageFile)

		if err != nil {
			klog.Errorf("error reading client status key %s: %s", key, err)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}

		c.Response().Status = http.StatusOK
		c.Response().Header().Add(echo.HeaderContentType, "text/plain")
		c.Response().Header().Add("Cache-Control", "no-cache")
		_, err = c.Response().Write(byteValue)
		return err
	})

	e.DELETE("/client-status/:key-id", func(c echo.Context) error {

		key, filePath := clientInfo(config, c)

		err := os.Remove(filePath)

		if err != nil {
			klog.Errorf("error removing client status key %s: %s", key, err)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}

		return c.JSONBlob(http.StatusOK, []byte("{\"status\": \"success\"}"))
	})

	e.PUT("/client-status/:key-id", func(c echo.Context) error {

		key, filePath := clientInfo(config, c)

		data, err := ioutil.ReadAll(c.Request().Body)

		if err != nil {
			klog.Errorf("error reading data while updating client status key %s: %s", key, err)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}

		err = ioutil.WriteFile(
			filePath,
			data, 0764)

		if err != nil {
			klog.Errorf("error writing data while updating client status key: %s", key)
			return c.JSONBlob(http.StatusInternalServerError, []byte("{\"error\": \"internal server error\"}"))
		}

		return c.JSONBlob(http.StatusOK, []byte("{\"status\": \"success\"}"))
	})

	e.Static("/", "static")

	if err := e.Start(":8080"); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
