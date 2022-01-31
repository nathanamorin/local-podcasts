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
	"sort"
	"strconv"
	"strings"
)

const podcastInfoFilename = "info.json"
const podcastImageFilenameNoExt = "image"

type Episode struct {
	Name             string `json:"name"`
	Id               string `json:"id"`
	Description      string `json:"description"`
	AudioFile        string `json:"audio_file"`
	Length           int64
	PublishTimestamp int64
}

type Podcast struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Id                string `json:"id"`
	ImageFile         string `json:"image_file"`
	episodesMap       map[string]*Episode
	Episodes          []*Episode `json:"episodes,omitempty"`
	RSSUrl            string     `json:"rss_url"`
	DisableAutoUpdate bool       `json:"auto_update"`
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
		episodesMap: make(map[string]*Episode),
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
	episodes := make([]*Episode, 0)
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
		episodes = append(episodes, &Episode{
			Name:             item.Title,
			Id:               id,
			Description:      item.Description,
			AudioFile:        audio.URL,
			Length:           time,
			PublishTimestamp: item.PublishedParsed.Unix(),
		})
	}

	image := feed.Image
	var imageUrl string
	if image != nil {
		imageUrl = image.URL
	} else {
		imageUrl = "static/default_image.jpg"
	}
	podcast := Podcast{
		Name:        feed.Title,
		Id:          makeId(feed.Title),
		episodesMap: make(map[string]*Episode),
		Description: feed.Description,
		Episodes:    episodes,
		ImageFile:   imageUrl,
		RSSUrl:      rssUrl,
	}

	podcast.fillEpisodeMap()

	return &podcast, nil

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

func (p Podcast) GetAudioFile(config Config, episodeId string) (string, error) {
	episode, ok := p.episodesMap[episodeId]
	if !ok {
		return "", fmt.Errorf("episode id (%s) not found", episodeId)
	}
	filePath := filepath.Join(config.FileHome, p.Id, episode.AudioFile)
	if _, err := os.Stat(filePath); !errors.Is(err, os.ErrNotExist) {
		if err != nil {
			return "", err
		}
	}

	return filePath, nil
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

	if p.episodesMap == nil {
		p.episodesMap = make(map[string]*Episode)
	}

	for id, ep := range newPodcastInfo.episodesMap {
		if _, exists := p.episodesMap[id]; !exists {
			p.episodesMap[id] = ep
		} else {
			if !p.DisableAutoUpdate {
				newEp := ep
				newEp.AudioFile = p.episodesMap[id].AudioFile
				newEp.Length = p.episodesMap[id].Length
				p.episodesMap[id] = newEp
			}
		}
	}

	if err := p.checkPodcastDirExists(config); err != nil {
		return err
	}

	for id, _ := range p.episodesMap {
		err := p.SaveEpisode(config, p.episodesMap[id])
		if err != nil {
			return err
		}
	}

	newEpisodes := make([]*Episode, 0)

	for _, v := range p.episodesMap {
		newEpisodes = append(newEpisodes, v)
	}

	p.Episodes = newEpisodes

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

func (p Podcast) fillEpisodeMap() {
	if p.episodesMap == nil {
		p.episodesMap = make(map[string]*Episode)
	}
	for _, e := range p.Episodes {
		p.episodesMap[e.Id] = e
	}
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

	podcast.fillEpisodeMap()

	// Sort by publish date
	sort.Slice(podcast.Episodes, func(i, j int) bool {
		return podcast.Episodes[i].PublishTimestamp < podcast.Episodes[j].PublishTimestamp
	})

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
