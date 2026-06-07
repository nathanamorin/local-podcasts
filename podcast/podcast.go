package podcast

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/feeds"
	"github.com/hajimehoshi/go-mp3"
	"github.com/mmcdole/gofeed"
	"gorm.io/gorm"
	"k8s.io/klog/v2"
)

const podcastImageFilenameNoExt = "image"

type Episode struct {
	PodcastID        string `json:"-" gorm:"primaryKey"`
	Id               string `json:"id" gorm:"primaryKey"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	AudioFile        string `json:"audio_file"`
	Length           int64  `json:"audio_length_sec"`
	ReadOrder        int    `json:"read_order"`
	PublishTimestamp int64  `json:"publish_timestamp"`
}

type Podcast struct {
	Id                string     `json:"id" gorm:"primaryKey"`
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	ImageFile         string     `json:"image_file"`
	episodesMap       map[string]*Episode
	Episodes          []*Episode `json:"episodes,omitempty" gorm:"foreignKey:PodcastID;references:Id"`
	RSSUrl            string     `json:"rss_url"`
	DisableAutoUpdate bool       `json:"disable_auto_update,omitempty"`
	LatestEpisode     *Episode   `json:"latest_episode" gorm:"-"`
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
	db                   *gorm.DB
}

const threads = 5

func NewPodcastWatcher(config Config, db *gorm.DB) PodcastWatcher {
	return PodcastWatcher{
		podcastsToUpdate:     make(chan Podcast, 500),
		currentDownloads:     make(map[string]int),
		currentDownloadsLock: sync.RWMutex{},
		podcastsCache:        make([]Podcast, 0),
		podcastsCacheLock:    sync.RWMutex{},
		config:               config,
		db:                   db,
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
					err := podcastToUpdate.Update(config, pw.db)
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

func (pw *PodcastWatcher) InvalidateCache() {
	pw.podcastsCacheLock.Lock()
	defer pw.podcastsCacheLock.Unlock()
	pw.podcastsCache = make([]Podcast, 0)
}

func (pw *PodcastWatcher) EnqueuePodcast(podcast Podcast) {
	klog.Infof("enqueued podcast %s for update", podcast.Name)
	pw.podcastsToUpdate <- podcast
}

func (pw *PodcastWatcher) GetPodcast(id string) (*Podcast, error) {
	podcast := NewPodcastObj()

	result := pw.db.Preload("Episodes").Where("id = ?", id).First(&podcast)
	if result.Error != nil {
		return nil, result.Error
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

	var podcasts []Podcast
	result := pw.db.Preload("Episodes").Find(&podcasts)
	if result.Error != nil {
		return nil, result.Error
	}

	for idx := range podcasts {
		podcasts[idx].fillEpisodeMap()

		sort.Slice(podcasts[idx].Episodes, func(i, j int) bool {
			if podcasts[idx].Episodes[i].PublishTimestamp == podcasts[idx].Episodes[j].PublishTimestamp {
				return podcasts[idx].Episodes[i].ReadOrder > podcasts[idx].Episodes[j].ReadOrder
			}
			return podcasts[idx].Episodes[i].PublishTimestamp > podcasts[idx].Episodes[j].PublishTimestamp
		})

		if len(podcasts[idx].Episodes) > 0 {
			podcasts[idx].LatestEpisode = podcasts[idx].Episodes[0]
		}
	}

	sort.Slice(podcasts, func(i, j int) bool {
		if podcasts[i].LatestEpisode == nil || podcasts[j].LatestEpisode == nil {
			return false
		}
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
			streamURL := hostPrefix + "/podcasts/" + podcast.Id + "/episodes/" + ep.Id + "/stream"
			items = append(items, &feeds.Item{
				Title: podcast.Name + " - " + ep.Name,
				Link:  &feeds.Link{Href: streamURL},
				Enclosure: &feeds.Enclosure{
					Url:  streamURL,
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

func AddPodcast(config Config, db *gorm.DB, RSSUrl string) (*Podcast, error) {
	podcast := NewPodcastObj()
	podcast.RSSUrl = RSSUrl
	feedData, err := podcast.readCurrentFeed()
	if err != nil {
		return nil, err
	}

	newPodcastInfo, err := parsePodcastRss(feedData, podcast.RSSUrl)
	if err != nil {
		return nil, fmt.Errorf("error parsing podcast rss: %s", err)
	}

	if err = newPodcastInfo.SavePodcastMetadata(config, db); err != nil {
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

func (p *Podcast) saveEpisode(ep *Episode, db *gorm.DB) error {
	ep.PodcastID = p.Id
	return db.Save(ep).Error
}

func (p *Podcast) Update(config Config, db *gorm.DB) error {

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

	// Persist podcast + all episode metadata immediately (remote URLs) so the
	// podcast is queryable before any audio files finish downloading.
	if err = p.SavePodcastMetadata(config, db); err != nil {
		return fmt.Errorf("error saving metadata before episode sync: %s", err)
	}

	const episodeThreads = 5
	sem := make(chan struct{}, episodeThreads)
	var wg sync.WaitGroup

	for _, ep := range p.Episodes {
		wg.Add(1)
		sem <- struct{}{}
		go func(ep *Episode) {
			defer wg.Done()
			defer func() { <-sem }()

			if err := p.SyncPodcastEpisode(config, ep); err != nil {
				klog.Errorf("error syncing episode %s: %s", ep.Name, err)
				return
			}
			// Save only this episode — avoids concurrent reads/writes on the
			// shared Podcast struct that SavePodcastMetadata would cause.
			if err := p.saveEpisode(ep, db); err != nil {
				klog.Errorf("error saving episode %s: %s", ep.Name, err)
			}
		}(ep)
	}

	wg.Wait()
	return nil
}

func getAudioLength(audioFile string) (int64, error) {
	info, err := os.Stat(audioFile)
	if err != nil {
		return -1, fmt.Errorf("stat %s: %w", audioFile, err)
	}
	if info.Size() == 0 {
		return -1, fmt.Errorf("audio file is empty: %s", audioFile)
	}

	r, err := os.Open(audioFile)
	if err != nil {
		return -1, fmt.Errorf("open %s: %w", audioFile, err)
	}
	defer r.Close()

	d, err := mp3.NewDecoder(r)
	if err != nil {
		return -1, fmt.Errorf("decode mp3 %s (size=%d): %w", audioFile, info.Size(), err)
	}

	const sampleSize = int64(4)
	samples := d.Length() / sampleSize
	return samples / int64(d.SampleRate()), nil
}

func (p *Podcast) SyncPodcastEpisode(config Config, episode *Episode) error {

	if strings.HasPrefix(episode.AudioFile, "http") {
		if err := p.checkPodcastDirExists(config); err != nil {
			return err
		}

		klog.Infof("downloading episode: %s -> %s", p.Name, episode.Name)

		resp, err := http.Get(episode.AudioFile)
		if err != nil {
			return fmt.Errorf("GET %s: %w", episode.AudioFile, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("unexpected HTTP %d downloading episode %q from %s",
				resp.StatusCode, episode.Name, episode.AudioFile)
		}

		fileExtension := filepath.Ext(episode.AudioFile)
		if fileExtension == "" {
			fileExtension = ".mp3"
		}
		fileExtension = strings.Split(fileExtension, "?")[0]
		episodeFilename := episode.Id + fileExtension
		episodeFilePath := filepath.Join(config.FileHome, p.Id, episodeFilename)

		// Remove any existing (possibly partial) file before writing.
		if _, err := os.Stat(episodeFilePath); !errors.Is(err, os.ErrNotExist) {
			if err := os.Remove(episodeFilePath); err != nil {
				return fmt.Errorf("remove existing file %s: %w", episodeFilePath, err)
			}
		}

		file, err := os.Create(episodeFilePath)
		if err != nil {
			return fmt.Errorf("create %s: %w", episodeFilePath, err)
		}

		n, err := file.ReadFrom(resp.Body)
		file.Close()
		if err != nil {
			os.Remove(episodeFilePath)
			return fmt.Errorf("write episode %q to %s (wrote %d bytes): %w",
				episode.Name, episodeFilePath, n, err)
		}
		if n == 0 {
			os.Remove(episodeFilePath)
			return fmt.Errorf("episode %q downloaded 0 bytes from %s", episode.Name, episode.AudioFile)
		}

		episode.AudioFile = episodeFilename
		klog.Infof("downloaded episode: %s -> %s (%d bytes)", p.Name, episode.Name, n)
	}

	if episode.Length <= 0 {
		audioFile, err := p.GetAudioFile(config, episode.Id)
		if err != nil {
			return fmt.Errorf("locate audio file for episode %q: %w", episode.Name, err)
		}

		audioLength, err := getAudioLength(audioFile)
		if err != nil {
			// Non-fatal: length is cosmetic. Log, delete corrupt file so it
			// re-downloads next cycle, and continue.
			klog.Warningf("could not determine length of %q (%s), file may be corrupt — deleting for re-download: %s",
				episode.Name, audioFile, err)
			os.Remove(audioFile)
			episode.AudioFile = strings.TrimPrefix(episode.AudioFile, filepath.Base(audioFile))
			return nil
		}
		episode.Length = audioLength
	}

	return nil
}

func (p *Podcast) SavePodcastMetadata(config Config, db *gorm.DB) error {

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

	// Ensure all episodes have the correct PodcastID set before saving.
	for _, ep := range p.Episodes {
		ep.PodcastID = p.Id
	}

	result := db.Session(&gorm.Session{FullSaveAssociations: true}).Save(p)
	return result.Error
}

func (p *Podcast) fillEpisodeMap() {
	if p.episodesMap == nil {
		p.episodesMap = make(map[string]*Episode)
	}
	for _, e := range p.Episodes {
		p.episodesMap[e.Id] = e
	}
}
