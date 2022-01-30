package podcast

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/golang/glog"
	"github.com/mmcdole/gofeed"
	"io/ioutil"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const podcastInfoFilename = "info.json"
const podcastImageFilenameNoExt = "image"

type Episode struct {
	Name        string `json:"name"`
	Id          string `json:"id"`
	Description string `json:"description"`
	AudioFile   string `json:"audio_file"`
	Length      int64
}

type Podcast struct {
	Name              string              `json:"name"`
	Description       string              `json:"description"`
	Id                string              `json:"id"`
	ImageFile         string              `json:"image_file"`
	Episodes          map[string]*Episode `json:"episodes,omitempty"`
	RSSUrl            string              `json:"rss_url"`
	DisableAutoUpdate bool                `json:"auto_update"`
}

type Config struct {
	FileHome string `json:"file_home"`
}

type PodcastWatcher struct {
	podcastsToUpdate chan Podcast
}

func NewPodcastWatcher() PodcastWatcher {
	return PodcastWatcher{
		podcastsToUpdate: make(chan Podcast, 500),
	}
}

func (pw PodcastWatcher) Run(config Config) {
	go func() {
		for podcastToUpdate := range pw.podcastsToUpdate {
			err := podcastToUpdate.Update(config)
			if err != nil {
				glog.Errorf("error updating podcast (%s): %s", podcastToUpdate.Name, err)
			}
		}
	}()
}

func (pw PodcastWatcher) Stop() {
	close(pw.podcastsToUpdate)
}

func (pw PodcastWatcher) EnqueuePodcast(podcast Podcast) {
	pw.podcastsToUpdate <- podcast
}

func NewPodcastObj() Podcast {
	return Podcast{
		Episodes: make(map[string]*Episode),
	}
}

func (p Podcast) readCurrentFeed() (string, error) {
	resp, err := http.Get(p.RSSUrl)
	if err != nil {
		return "", fmt.Errorf("error making get request %s: %s", p.RSSUrl, err)
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}

func makeId(name string) string {
	hash := md5.Sum([]byte(name))
	return hex.EncodeToString(hash[:])
}

func parsePodcastRss(feedData string, rssUrl string) (*Podcast, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseString(feedData)

	if err != nil {
		return nil, err
	}
	episodes := make(map[string]*Episode)
	for _, item := range feed.Items {
		if len(item.Enclosures) <= 0 {
			continue
		}
		audio := item.Enclosures[0]
		time, err := strconv.ParseInt(audio.Length, 10, 64)
		if err != nil {
			return nil, err
		}
		id := makeId(item.Title)
		episodes[id] = &Episode{
			Name:        item.Title,
			Id:          id,
			Description: item.Description,
			AudioFile:   audio.URL,
			Length:      time,
		}
	}

	image := feed.Image
	var imageUrl string
	if image != nil {
		imageUrl = image.URL
	} else {
		imageUrl = "static/default_image.jpg"
	}
	return &Podcast{
		Name:        feed.Title,
		Id:          makeId(feed.Title),
		Description: feed.Description,
		Episodes:    episodes,
		ImageFile:   imageUrl,
		RSSUrl:      rssUrl,
	}, nil

}

func (p Podcast) GetImage(config Config) ([]byte, string, error) {
	filePath := filepath.Join(config.FileHome, p.Id, p.ImageFile)
	imageFile, err := os.Open(filePath)
	if err != nil {
		return nil, "", err
	}
	defer imageFile.Close()

	byteValue, err := ioutil.ReadAll(imageFile)

	if err != nil {
		return nil, "", err
	}

	return byteValue, mime.TypeByExtension(filepath.Ext(p.ImageFile)), nil
}

func (p Podcast) Stream(config Config, episodeId string) ([]byte, string, error) {
	episode, ok := p.Episodes[episodeId]
	if !ok {
		return nil, "", fmt.Errorf("episode id (%s) not found", episodeId)
	}
	filePath := filepath.Join(config.FileHome, p.Id, episode.AudioFile)
	audioFile, err := os.Open(filePath)
	if err != nil {
		return nil, "", err
	}
	defer audioFile.Close()

	byteValue, err := ioutil.ReadAll(audioFile)

	if err != nil {
		return nil, "", err
	}

	return byteValue, mime.TypeByExtension(filepath.Ext(episode.AudioFile)), nil
}

func (p Podcast) mergeNewInfo(newPodcast *Podcast) {
	p.Id = newPodcast.Id
	p.Name = newPodcast.Name
	p.ImageFile = newPodcast.ImageFile
	p.Description = newPodcast.Description
}

func AddPodcast(config Config, RSSUrl string) (*Podcast, error) {
	podcast := NewPodcastObj()
	podcast.RSSUrl = RSSUrl
	feedData, err := podcast.readCurrentFeed()
	if err != nil {
		return nil, err
	}

	newPodcastInfo, err := parsePodcastRss(feedData, podcast.RSSUrl)

	err = newPodcastInfo.SaveInfo(config)
	if err != nil {
		return nil, err
	}
	return newPodcastInfo, nil
}

func (p Podcast) checkPodcastDirExists(config Config) error {
	podcastDir := filepath.Join(config.FileHome, p.Id)
	if _, err := os.Stat(podcastDir); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(podcastDir, 0764)
		if err != nil {
			return err
		}
	}

	return nil
}

func (p Podcast) Update(config Config) error {

	feedData, err := p.readCurrentFeed()
	if err != nil {
		return fmt.Errorf("error reading podcast rss in update: %s", err)
	}

	newPodcastInfo, err := parsePodcastRss(feedData, p.RSSUrl)

	if err != nil {
		return fmt.Errorf("error parsing podcast rss in update: %s", err)
	}

	if !p.DisableAutoUpdate {
		p.mergeNewInfo(newPodcastInfo)
	}

	if p.Episodes == nil {
		p.Episodes = make(map[string]*Episode)
	}

	for id, ep := range newPodcastInfo.Episodes {
		if _, ok := p.Episodes[id]; !ok {
			p.Episodes[id] = ep
		}
	}

	if err := p.checkPodcastDirExists(config); err != nil {
		return err
	}

	for id, _ := range p.Episodes {
		err := p.SaveEpisode(config, p.Episodes[id])
		if err != nil {
			return err
		}
	}

	err = p.SaveInfo(config)
	if err != nil {
		return fmt.Errorf("error saving info after update: %s", err)
	}
	return nil
}

func (p Podcast) SaveEpisode(config Config, episode *Episode) error {

	if !strings.HasPrefix(episode.AudioFile, "http") {
		return nil
	}

	if err := p.checkPodcastDirExists(config); err != nil {
		return err
	}
	glog.Infof("downloading podcast: %s -> %s", p.Name, episode.Name)
	resp, err := http.Get(episode.AudioFile)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	fileExtension := filepath.Ext(episode.AudioFile)
	if fileExtension == "" {
		// Assume mp3 if ext not defined
		fileExtension = ".mp3"
	}
	episodeFilename := episode.Id + fileExtension

	episodeFilePath := filepath.Join(config.FileHome, p.Id, episodeFilename)

	if _, err := os.Stat(episodeFilePath); !errors.Is(err, os.ErrNotExist) {
		err := os.Remove(episodeFilePath)
		if err != nil {
			return err
		}
	}

	file, err := os.Create(episodeFilePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.ReadFrom(resp.Body)
	if err != nil {
		return err
	}

	episode.AudioFile = episodeFilename
	glog.Infof("finished downloading podcast: %s -> %s", p.Name, episode.Name)
	return nil
}

func (p Podcast) SaveInfo(config Config) error {

	if err := p.checkPodcastDirExists(config); err != nil {
		return err
	}

	if !p.DisableAutoUpdate {
		if strings.HasPrefix(p.ImageFile, "http") {
			resp, err := http.Get(p.ImageFile)
			if err != nil {
				return err
			}
			imageData, err := ioutil.ReadAll(resp.Body)
			if err != nil {
				return err
			}

			imageFileName := podcastImageFilenameNoExt + filepath.Ext(p.ImageFile)
			err = ioutil.WriteFile(
				filepath.Join(config.FileHome, p.Id, imageFileName),
				imageData, 0764)

			if err != nil {
				return err
			}

			p.ImageFile = imageFileName

		}
	}

	jsonData, _ := json.MarshalIndent(p, "", " ")

	err := ioutil.WriteFile(filepath.Join(config.FileHome, p.Id, podcastInfoFilename), jsonData, 0764)

	if err != nil {
		return err
	}

	return nil
}

func GetPodcast(config Config, id string) (*Podcast, error) {
	filePath := filepath.Join(config.FileHome, id, podcastInfoFilename)
	jsonFile, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer jsonFile.Close()

	byteValue, err := ioutil.ReadAll(jsonFile)

	if err != nil {
		return nil, err
	}

	podcast := NewPodcastObj()

	err = json.Unmarshal(byteValue, &podcast)
	if err != nil {
		return nil, err
	}

	return &podcast, nil

}

func ListPodcasts(config Config) ([]Podcast, error) {
	files, err := ioutil.ReadDir(config.FileHome)

	if err != nil {
		return nil, err
	}

	podcasts := make([]Podcast, 0)

	for _, fileInfo := range files {
		if fileInfo.IsDir() {
			podcast, err := GetPodcast(config, fileInfo.Name())
			podcast.Episodes = nil
			if err != nil {
				return nil, err
			}
			podcasts = append(podcasts, *podcast)
		}
	}

	return podcasts, nil
}
