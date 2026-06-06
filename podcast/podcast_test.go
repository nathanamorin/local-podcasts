package podcast

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := InitDB(":memory:")
	require.NoError(t, err)
	return db
}

func mustParseRss(t *testing.T, data, url string) *Podcast {
	t.Helper()
	p, err := parsePodcastRss(data, url)
	require.NoError(t, err)
	return p
}

func tempConfig(t *testing.T) Config {
	t.Helper()
	return Config{FileHome: t.TempDir()}
}

// savePodcast is a test convenience that replaces the remote image URL so
// SavePodcastMetadata does not attempt a real HTTP request.
func savePodcast(t *testing.T, p *Podcast, config Config, db *gorm.DB) {
	t.Helper()
	if p.ImageFile == "" || len(p.ImageFile) > 4 && p.ImageFile[:4] == "http" {
		p.ImageFile = "image.jpg"
	}
	require.NoError(t, p.SavePodcastMetadata(config, db))
}

// ---------------------------------------------------------------------------
// DB init
// ---------------------------------------------------------------------------

func TestInitDB(t *testing.T) {
	db := openTestDB(t)
	require.NotNil(t, db)

	var podcastCount, episodeCount int64
	require.NoError(t, db.Model(&Podcast{}).Count(&podcastCount).Error)
	require.NoError(t, db.Model(&Episode{}).Count(&episodeCount).Error)
	assert.Equal(t, int64(0), podcastCount)
	assert.Equal(t, int64(0), episodeCount)
}

// ---------------------------------------------------------------------------
// SavePodcastMetadata
// ---------------------------------------------------------------------------

func TestSavePodcastMetadata(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	// Podcast directory created.
	_, err := os.Stat(filepath.Join(config.FileHome, p.Id))
	assert.NoError(t, err)

	var pCount, eCount int64
	require.NoError(t, db.Model(&Podcast{}).Count(&pCount).Error)
	require.NoError(t, db.Model(&Episode{}).Count(&eCount).Error)
	assert.Equal(t, int64(1), pCount)
	assert.Equal(t, int64(2), eCount)
}

func TestSavePodcastMetadata_Upsert(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	p.Name = "Updated Name"
	require.NoError(t, p.SavePodcastMetadata(config, db))

	var count int64
	require.NoError(t, db.Model(&Podcast{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	var saved Podcast
	require.NoError(t, db.First(&saved, "id = ?", p.Id).Error)
	assert.Equal(t, "Updated Name", saved.Name)
}

// ---------------------------------------------------------------------------
// GetPodcast
// ---------------------------------------------------------------------------

func TestGetPodcast(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	pw := NewPodcastWatcher(config, db)

	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	got, err := pw.GetPodcast(p.Id)
	require.NoError(t, err)
	assert.Equal(t, p.Id, got.Id)
	assert.Equal(t, "Dan Carlin's Hardcore History", got.Name)
	assert.Equal(t, 2, len(got.Episodes))
	require.NotNil(t, got.LatestEpisode)
	// Show 67 has the highest publish timestamp.
	assert.Equal(t, int64(1623165635), got.LatestEpisode.PublishTimestamp)
}

func TestGetPodcast_EpisodesSortedByTimestamp(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	pw := NewPodcastWatcher(config, db)

	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	got, err := pw.GetPodcast(p.Id)
	require.NoError(t, err)
	require.Equal(t, 2, len(got.Episodes))
	assert.True(t, got.Episodes[0].PublishTimestamp >= got.Episodes[1].PublishTimestamp)
}

func TestGetPodcast_NotFound(t *testing.T) {
	db := openTestDB(t)
	pw := NewPodcastWatcher(tempConfig(t), db)
	_, err := pw.GetPodcast("doesnotexist")
	assert.Error(t, err)
}

// ---------------------------------------------------------------------------
// ListPodcasts & cache
// ---------------------------------------------------------------------------

func TestListPodcasts_Empty(t *testing.T) {
	db := openTestDB(t)
	pw := NewPodcastWatcher(tempConfig(t), db)
	podcasts, err := pw.ListPodcasts()
	require.NoError(t, err)
	assert.Empty(t, podcasts)
}

func TestListPodcasts(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	pw := NewPodcastWatcher(config, db)

	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	podcasts, err := pw.ListPodcasts()
	require.NoError(t, err)
	require.Equal(t, 1, len(podcasts))
	assert.Equal(t, p.Id, podcasts[0].Id)
}

func TestListPodcasts_UsesCache(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	pw := NewPodcastWatcher(config, db)

	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	// Warm the cache.
	first, err := pw.ListPodcasts()
	require.NoError(t, err)
	require.Equal(t, 1, len(first))

	// Insert a second podcast directly into DB behind the watcher's back.
	p2 := mustParseRss(t, testDataWithUpdate, "https://test456")
	p2.Id = "aabb1234aabb1234"
	p2.ImageFile = "image.jpg"
	for _, ep := range p2.Episodes {
		ep.PodcastID = p2.Id
	}
	require.NoError(t, db.Session(&gorm.Session{FullSaveAssociations: true}).Save(&p2).Error)

	// Cached result should still show only 1.
	cached, err := pw.ListPodcasts()
	require.NoError(t, err)
	assert.Equal(t, 1, len(cached))
}

func TestInvalidateCache(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)
	pw := NewPodcastWatcher(config, db)

	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	// Warm cache.
	_, err := pw.ListPodcasts()
	require.NoError(t, err)

	// Insert another podcast directly into the DB.
	p2 := mustParseRss(t, testDataWithUpdate, "https://test456")
	p2.Id = "aabb1234aabb1234"
	p2.ImageFile = "image.jpg"
	for _, ep := range p2.Episodes {
		ep.PodcastID = p2.Id
	}
	require.NoError(t, db.Session(&gorm.Session{FullSaveAssociations: true}).Save(&p2).Error)

	pw.InvalidateCache()

	fresh, err := pw.ListPodcasts()
	require.NoError(t, err)
	assert.Equal(t, 2, len(fresh))
}

// ---------------------------------------------------------------------------
// MigrateFromFiles
// ---------------------------------------------------------------------------

func TestMigrateFromFiles_ImportsJSON(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)

	p := mustParseRss(t, testData, "https://test123")
	p.ImageFile = "image.jpg"

	podcastDir := filepath.Join(config.FileHome, p.Id)
	require.NoError(t, os.Mkdir(podcastDir, 0764))
	data, err := json.MarshalIndent(p, "", " ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(podcastDir, podcastInfoFilename), data, 0644))

	require.NoError(t, MigrateFromFiles(config, db))

	var pCount, eCount int64
	require.NoError(t, db.Model(&Podcast{}).Count(&pCount).Error)
	require.NoError(t, db.Model(&Episode{}).Count(&eCount).Error)
	assert.Equal(t, int64(1), pCount)
	assert.Equal(t, int64(2), eCount)
}

func TestMigrateFromFiles_SkipsWhenRowsExist(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)

	// Pre-seed the DB.
	p := mustParseRss(t, testData, "https://test123")
	savePodcast(t, p, config, db)

	// Write a different podcast to disk — should be ignored.
	p2Dir := filepath.Join(config.FileHome, "aabb1234aabb1234")
	require.NoError(t, os.Mkdir(p2Dir, 0764))
	p2 := mustParseRss(t, testDataWithUpdate, "https://other")
	p2.Id = "aabb1234aabb1234"
	data, _ := json.MarshalIndent(p2, "", " ")
	require.NoError(t, os.WriteFile(filepath.Join(p2Dir, podcastInfoFilename), data, 0644))

	require.NoError(t, MigrateFromFiles(config, db))

	var count int64
	require.NoError(t, db.Model(&Podcast{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestMigrateFromFiles_SkipsNonAlphanumericDirs(t *testing.T) {
	db := openTestDB(t)
	config := tempConfig(t)

	require.NoError(t, os.Mkdir(filepath.Join(config.FileHome, "user_data"), 0764))
	require.NoError(t, os.Mkdir(filepath.Join(config.FileHome, "NotAPodcast"), 0764))
	require.NoError(t, os.Mkdir(filepath.Join(config.FileHome, "has-dashes"), 0764))

	require.NoError(t, MigrateFromFiles(config, db))

	var count int64
	require.NoError(t, db.Model(&Podcast{}).Count(&count).Error)
	assert.Equal(t, int64(0), count)
}

// ---------------------------------------------------------------------------
// RSS parsing
// ---------------------------------------------------------------------------

func TestParser_Parse(t *testing.T) {
	p, err := parsePodcastRss(testData, "https://test123")
	assert.NoError(t, err)
	assert.Equal(t, "Dan Carlin's Hardcore History", p.Name)
	assert.Equal(t, "c81d442464cc19295f94a97e95d762c3", p.Id)
	assert.Equal(t, 2, len(p.episodesMap))
	ep := p.episodesMap["6e50678087dc4fc44ad8f23e4d30de94"]
	require.NotNil(t, ep)
	assert.Equal(t, "Show 67 - Supernova in the East VI", ep.Name)
	assert.Equal(t, int64(250137274), ep.Length)
	assert.Equal(t, int64(1623165635), ep.PublishTimestamp)
}

func TestSyncNewData(t *testing.T) {
	p, _ := parsePodcastRss(testData, "https://test123")

	err := p.syncNewData(testDataWithUpdate)

	assert.Nil(t, err)
	assert.Equal(t, 3, len(p.episodesMap))
	assert.Equal(t, 3, len(p.Episodes))
}

func TestSyncNewData_ExistingLocalAudioPreserved(t *testing.T) {
	p, _ := parsePodcastRss(testData, "https://test123")

	// Simulate a locally-downloaded episode.
	ep := p.episodesMap["6e50678087dc4fc44ad8f23e4d30de94"]
	ep.AudioFile = "6e50678087dc4fc44ad8f23e4d30de94.mp3"

	require.NoError(t, p.syncNewData(testDataWithUpdate))

	// Local path must not be overwritten by the remote URL.
	assert.Equal(t, "6e50678087dc4fc44ad8f23e4d30de94.mp3",
		p.episodesMap["6e50678087dc4fc44ad8f23e4d30de94"].AudioFile)
}

func TestSyncNewData_DisableAutoUpdate(t *testing.T) {
	p, _ := parsePodcastRss(testData, "https://test123")
	p.Name = "My Custom Name"
	p.DisableAutoUpdate = true

	require.NoError(t, p.syncNewData(testDataWithUpdate))

	assert.Equal(t, "My Custom Name", p.Name)
	assert.Equal(t, 3, len(p.Episodes))
}

// ---------------------------------------------------------------------------
// RenderPodcasts
// ---------------------------------------------------------------------------

func TestRenderPodcasts(t *testing.T) {
	p, err := parsePodcastRss(testData, "https://test123")
	require.NoError(t, err)

	rss, err := RenderPodcasts([]Podcast{*p}, "http://localhost:8080")
	require.NoError(t, err)
	assert.Contains(t, rss, "<rss")
	assert.Contains(t, rss, "Show 67 - Supernova in the East VI")
	assert.Contains(t, rss, "http://localhost:8080/podcasts/")
}

func TestRenderPodcasts_Empty(t *testing.T) {
	rss, err := RenderPodcasts([]Podcast{}, "http://localhost:8080")
	require.NoError(t, err)
	assert.Contains(t, rss, "<rss")
}

// ---------------------------------------------------------------------------
// Test fixtures (RSS data)
// ---------------------------------------------------------------------------

const testData = `
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" media="screen" href="/~d/styles/rss2enclosuresfull.xsl"?><?xml-stylesheet type="text/css" media="screen" href="http://feeds.feedburner.com/~d/styles/itemcontent.css"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel>
      <title>Dan Carlin's Hardcore History</title>
       <description>In "Hardcore History" journalist and broadcaster Dan Carlin takes his "Martian", unorthodox way of thinking and applies it to the past. Was Alexander the Great as bad a person as Adolf Hitler? What would Apaches with modern weapons be like? Will our modern civilization ever fall like civilizations from past eras? This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</description>
       <link>http://www.dancarlin.com</link>
                  <pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
                  <language>en-us</language>
                                   <itunes:image href="http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg" />
                                   <image><url>http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg</url>
                                   <link>http://www.dancarlin.com</link><title>Dan Carlin's Hardcore History</title></image>
                              <itunes:keywords>History, Military, War, Ancient, Archaeology, Classics, Carlin</itunes:keywords>
                              <itunes:category text="History" />
                              <itunes:explicit>no</itunes:explicit>
<atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="self" type="application/rss+xml" href="http://feeds.feedburner.com/dancarlin/history" /><feedburner:info xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0" uri="dancarlin/history" /><atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="hub" href="http://pubsubhubbub.appspot.com/" /><item>
<title>Show 67 - Supernova in the East VI</title>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3</guid>
<description>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</description>
<pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3" length="250137274" type="audio/mpeg" />
</item>
<item>
<title>Show 66 - Supernova in the East V</title>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3</guid>
<description>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</description>
<pubDate>Fri, 13 Nov 2020 17:08:26 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3" length="154515612" type="audio/mpeg" />
</item>
</channel>
</rss>
`

const testDataWithUpdate = `
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" media="screen" href="/~d/styles/rss2enclosuresfull.xsl"?><?xml-stylesheet type="text/css" media="screen" href="http://feeds.feedburner.com/~d/styles/itemcontent.css"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel>
      <title>Dan Carlin's Hardcore History</title>
       <description>In "Hardcore History" journalist and broadcaster Dan Carlin takes his "Martian", unorthodox way of thinking and applies it to the past. Was Alexander the Great as bad a person as Adolf Hitler? What would Apaches with modern weapons be like? Will our modern civilization ever fall like civilizations from past eras? This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</description>
       <link>http://www.dancarlin.com</link>
                  <pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
                  <language>en-us</language>
                                   <itunes:image href="http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg" />
                                   <image><url>http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg</url>
                                   <link>http://www.dancarlin.com</link><title>Dan Carlin's Hardcore History</title></image>
                              <itunes:keywords>History, Military, War, Ancient, Archaeology, Classics, Carlin</itunes:keywords>
                              <itunes:category text="History" />
                              <itunes:explicit>no</itunes:explicit>
<atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="self" type="application/rss+xml" href="http://feeds.feedburner.com/dancarlin/history" /><feedburner:info xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0" uri="dancarlin/history" /><atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="hub" href="http://pubsubhubbub.appspot.com/" /><item>
<title>Show 67 - Supernova in the East VI</title>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3</guid>
<description>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</description>
<pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3" length="250137274" type="audio/mpeg" />
</item>
<item>
<title>Show 66 - Supernova in the East V</title>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3</guid>
<description>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</description>
<pubDate>Fri, 13 Nov 2020 17:08:26 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3" length="154515612" type="audio/mpeg" />
</item>
<item>
<title>Show 65 - Supernova in the East IV</title>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha65_Supernova_in_the_East_IV.mp3</guid>
<description>Coral Sea, Midway and Guadalcanal are three of the most famous battles of the Second World War. Together they will shift the momentum in the Pacific theater and usher in the era of modern naval and amphibious warfare.</description>
<pubDate>Wed, 3 Jun 2020 15:20:44 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha65_Supernova_in_the_East_IV.mp3" length="174313810" type="audio/mpeg" />
</item>
</channel>
</rss>
`
