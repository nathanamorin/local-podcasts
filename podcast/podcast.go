package podcast

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/feeds"
	"github.com/hajimehoshi/go-mp3"
	"github.com/mmcdole/gofeed"
	"k8s.io/klog/v2"
)

const podcastInfoFilename = "info.json"
const podcastImageFilenameNoExt = "image"

type Episode struct {
	Name             string `json:"name"`
	Id               string `json:"id"`
	Description      string `json:"description"`
	AudioFile        string `json:"audio_file"`
	Length           int64  `json:"audio_length_sec"`
	ReadOrder        int    `json:"read_order"`
	PublishTimestamp int64  `json:"publish_timestamp"`
}

type Podcast struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Id                string `json:"id"`
	ImageFile         string `json:"image_file"`
	episodesMap       map[string]*Episode
	Episodes          []*Episode `json:"episodes,omitempty"`
	RSSUrl            string     `json:"rss_url"`
	DisableAutoUpdate bool       `json:"disable_auto_update,omitempty"`
	LatestEpisode     *Episode   `json:"latest_episode"`
}

type Config struct {
	FileHome string `json:"file_home"`
}

type PodcastWatcher struct {
	podcastsToUpdate     chan Podcast
	currentDownloads     map[string]int
	currentDownloadsLock sync.RWMutex
	podcastsCache        []Podcast
	podcastsCacheLock    sync.RWMutex
	config               Config
}

const threads = 5

func NewPodcastWatcher(config Config) PodcastWatcher {
	return PodcastWatcher{
		podcastsToUpdate:     make(chan Podcast, 500),
		currentDownloads:     make(map[string]int),
		currentDownloadsLock: sync.RWMutex{},
		podcastsCache:        make([]Podcast, 0),
		podcastsCacheLock:    sync.RWMutex{},
		config:               config,
	}
}

// RegisterUpdating returns if podcast is already updating
func (pw *PodcastWatcher) RegisterUpdating(podcast Podcast, threadIdx int) bool {
	pw.currentDownloadsLock.Lock()
	defer pw.currentDownloadsLock.Unlock()

	if _, ok := pw.currentDownloads[podcast.Id]; ok {
		return true
	} else {
		pw.currentDownloads[podcast.Id] = threadIdx
		return false
	}
}

func (pw *PodcastWatcher) UnRegisterUpdating(podcast Podcast) {
	pw.currentDownloadsLock.Lock()
	defer pw.currentDownloadsLock.Unlock()

	delete(pw.currentDownloads, podcast.Id)
}

func (pw *PodcastWatcher) Run(config Config) {

	for i := 0; i < threads; i++ {
		go func() {
			for podcastToUpdate := range pw.podcastsToUpdate {
				func() {
					isAlreadyUpdating := pw.RegisterUpdating(podcastToUpdate, i)
					defer pw.UnRegisterUpdating(podcastToUpdate)

					if isAlreadyUpdating {
						klog.Infof("already updating podcast (%s), skipping", podcastToUpdate.Name)
						return
					}
					err := podcastToUpdate.Update(config)
					if err != nil {
						klog.Errorf("error updating podcast (%s): %s", podcastToUpdate.Name, err)
					}

					_, err = pw.RefreshPodcastMetadataCache()
					if err != nil {
						klog.Errorf("error refreshing podcast cache (%s): %s", podcastToUpdate.Name, err)
					}
				}()
			}
		}()
	}
}

func (pw *PodcastWatcher) Stop() {
	close(pw.podcastsToUpdate)
}

func (pw *PodcastWatcher) QueueEmpty() bool {
	return len(pw.podcastsToUpdate) == 0
}

func (pw *PodcastWatcher) EnqueuePodcast(podcast Podcast) {
	klog.Infof("enqueued podcast %s for update", podcast.Name)
	pw.podcastsToUpdate <- podcast
}

func (pw *PodcastWatcher) GetPodcast(id string) (*Podcast, error) {
	filePath := filepath.Join(pw.config.FileHome, id, podcastInfoFilename)
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

	// Sort by publish date & read order
	sort.Slice(podcast.Episodes, func(i, j int) bool {
		if podcast.Episodes[i].PublishTimestamp == podcast.Episodes[j].PublishTimestamp {
			return podcast.Episodes[i].ReadOrder > podcast.Episodes[j].ReadOrder
		}

		return podcast.Episodes[i].PublishTimestamp > podcast.Episodes[j].PublishTimestamp
	})

	if len(podcast.Episodes) <= 0 {
		return nil, fmt.Errorf("podcast with 0 episodes")
	}
	podcast.LatestEpisode = podcast.Episodes[0]

	return &podcast, nil

}

func (pw *PodcastWatcher) ListPodcasts() ([]Podcast, error) {
	pw.podcastsCacheLock.RLock()
	if len(pw.podcastsCache) > 0 {
		podcasts := make([]Podcast, len(pw.podcastsCache))
		copy(podcasts, pw.podcastsCache)
		pw.podcastsCacheLock.RUnlock()
		return podcasts, nil
	}
	pw.podcastsCacheLock.RUnlock()

	podcasts, err := pw.RefreshPodcastMetadataCache()
	if err != nil {
		return nil, err
	}

	return podcasts, nil
}

func (pw *PodcastWatcher) RefreshPodcastMetadataCache() ([]Podcast, error) {
	pw.podcastsCacheLock.Lock()
	defer pw.podcastsCacheLock.Unlock()
	files, err := ioutil.ReadDir(pw.config.FileHome)

	isAlpha := regexp.MustCompile(`^[a-z0-9]+$`).MatchString

	if err != nil {
		return nil, err
	}

	podcasts := make([]Podcast, 0)

	for _, fileInfo := range files {
		if fileInfo.IsDir() && isAlpha(fileInfo.Name()) {
			podcast, err := pw.GetPodcast(fileInfo.Name())
			if err != nil {
				klog.Errorf("error fetching podcast %s: %s", fileInfo.Name(), err)
				continue
			}
			podcast.fillEpisodeMap()
			podcasts = append(podcasts, *podcast)
		}
	}

	sort.Slice(podcasts, func(i, j int) bool {
		return podcasts[i].LatestEpisode.PublishTimestamp > podcasts[j].LatestEpisode.PublishTimestamp
	})

	pw.podcastsCache = podcasts

	return podcasts, nil
}

func NewPodcastObj() Podcast {
	return Podcast{
		episodesMap: make(map[string]*Episode),
	}
}

func (p *Podcast) readCurrentFeed() (string, error) {
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

func RenderPodcasts(podcasts []Podcast, hostPrefix string) (string, error) {
	var items []*feeds.Item

	for _, podcast := range podcasts {
		for _, ep := range podcast.Episodes {
			items = append(items, &feeds.Item{
				Title: podcast.Name + " - " + ep.Name,
				Enclosure: &feeds.Enclosure{
					Url:  hostPrefix + "/podcasts/" + podcast.Id + "/episodes/" + ep.Id + "/stream",
					Type: "audio",
				},
				Description: ep.Description,
				Id:          podcast.Id + "--" + ep.Id,
				Updated:     time.Unix(ep.PublishTimestamp, 0),
				Created:     time.Unix(ep.PublishTimestamp, 0),
			})
		}
	}

	feed := feeds.Feed{
		Title: "Local Podcasts",
		Link: &feeds.Link{
			Href: "https://github.com/nathanamorin/local-podcasts",
		},
		Description: "Local Podcasts Consolidated Feed",
		Updated:     time.Now(),
		Created:     time.Now(),
		Items:       items,
	}

	return feed.ToRss()
}

func parsePodcastRss(feedData string, rssUrl string) (*Podcast, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseString(feedData)

	if err != nil {
		return nil, err
	}
	episodes := make([]*Episode, 0)
	for i, item := range feed.Items {
		if len(item.Enclosures) <= 0 {
			continue
		}
		audio := item.Enclosures[0]

		id := makeId(item.Title)

		publishedTime := item.PublishedParsed
		if publishedTime == nil {
			currentTime := time.Now()
			publishedTime = &currentTime
		}

		audioLength, err := strconv.ParseInt(audio.Length, 10, 64)
		if err != nil {
			audioLength = 0
			klog.Infof("invalid audio length %s for podcast %s", audio.Length, feed.Title)
		}

		episodes = append(episodes, &Episode{
			Name:             item.Title,
			Id:               id,
			Description:      item.Description,
			AudioFile:        audio.URL,
			ReadOrder:        i,
			PublishTimestamp: publishedTime.Unix(),
			Length:           audioLength,
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

func (p *Podcast) GetImage(config Config) string {
	return filepath.Join(config.FileHome, p.Id, p.ImageFile)
}

func (p *Podcast) GetAudioFile(config Config, episodeId string) (string, error) {
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

func (p *Podcast) mergeNewInfo(newPodcast *Podcast) {
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

	err = newPodcastInfo.SavePodcastMetadata(config)
	if err != nil {
		return nil, err
	}

	return newPodcastInfo, nil
}

func (p *Podcast) checkPodcastDirExists(config Config) error {
	podcastDir := filepath.Join(config.FileHome, p.Id)
	if _, err := os.Stat(podcastDir); errors.Is(err, os.ErrNotExist) {
		err := os.Mkdir(podcastDir, 0764)
		if err != nil {
			return err
		}
	}

	return nil
}

func (p *Podcast) syncNewData(feedData string) error {

	currentNumPodcasts := len(p.Episodes)
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
				p.episodesMap[id].ReadOrder = ep.ReadOrder
			}
		}
	}

	p.Episodes = make([]*Episode, 0)

	for _, v := range p.episodesMap {
		p.Episodes = append(p.Episodes, v)
	}

	newNumPodcasts := len(p.Episodes)

	klog.Infof("discovered %d new episodes of podcast %s", newNumPodcasts-currentNumPodcasts, p.Name)

	return nil
}

func (p *Podcast) Update(config Config) error {

	klog.Infof("updating podcast: %s", p.Name)

	feedData, err := p.readCurrentFeed()
	if err != nil {
		return fmt.Errorf("error reading podcast rss in update: %s", err)
	}

	err = p.syncNewData(feedData)

	if err != nil {
		return fmt.Errorf("error syncing new data into existing podcast data: %s", err)
	}

	if err := p.checkPodcastDirExists(config); err != nil {
		return err
	}

	for _, ep := range p.Episodes {
		err := p.SyncPodcastEpisode(config, ep)
		if err != nil {
			return fmt.Errorf("error saving episode: %s", err)
		}
		err = p.SavePodcastMetadata(config)
		if err != nil {
			return fmt.Errorf("error saving info after saving episode: %s", err)
		}

	}

	return nil
}

func getAudioLength(audioFile string) (int64, error) {
	r, err := os.Open(audioFile)
	if err != nil {
		klog.Errorf("error opening mp3 file to find lenght: %s", err)
		return -1, err
	}

	d, err := mp3.NewDecoder(r)
	if err != nil {
		klog.Errorf("error decoding mp3 file to find lenght: %s", err)
		return -1, err
	}

	const sampleSize = int64(4)                 // From documentation.
	samples := d.Length() / sampleSize          // Number of samples.
	return samples / int64(d.SampleRate()), nil // Audio length in seconds.
}

func (p *Podcast) SyncPodcastEpisode(config Config, episode *Episode) error {

	if strings.HasPrefix(episode.AudioFile, "http") {
		// Download podcast episode
		if err := p.checkPodcastDirExists(config); err != nil {
			return err
		}
		klog.Infof("downloading podcast: %s -> %s", p.Name, episode.Name)
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
		fileExtension = strings.Split(fileExtension, "?")[0]
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
		klog.Infof("finished downloading podcast: %s -> %s", p.Name, episode.Name)
	}

	if episode.Length <= 0 {
		audioFile, err := p.GetAudioFile(config, episode.Id)
		if err != nil {
			klog.Errorf("error finding mp3 file to find length: %s", err)
			return err
		}
		audioLength, err := getAudioLength(audioFile)

		if err != nil {
			klog.Errorf("error fetching audio metadata: %s", err)
			return err
		}
		episode.Length = audioLength
	}

	return nil

}

func (p *Podcast) SavePodcastMetadata(config Config) error {

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

func (p *Podcast) fillEpisodeMap() {
	if p.episodesMap == nil {
		p.episodesMap = make(map[string]*Episode)
	}
	for _, e := range p.Episodes {
		p.episodesMap[e.Id] = e
	}
}
