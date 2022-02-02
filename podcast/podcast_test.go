package podcast

import (
	"github.com/stretchr/testify/assert"
	"testing"
)

const testData = `
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" media="screen" href="/~d/styles/rss2enclosuresfull.xsl"?><?xml-stylesheet type="text/css" media="screen" href="http://feeds.feedburner.com/~d/styles/itemcontent.css"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel>



      <title>Dan Carlin's Hardcore History</title>
       <description>In "Hardcore History" journalist and broadcaster Dan Carlin takes his "Martian", unorthodox way of thinking and applies it to the past. Was Alexander the Great as bad a person as Adolf Hitler? What would Apaches with modern weapons be like? Will our modern civilization ever fall like civilizations from past eras? This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</description>
       <itunes:summary>In "Hardcore History" journalist and broadcaster Dan Carlin takes his "Martian", unorthodox way of thinking and applies it to the past. Was Alexander the Great as bad a person as Adolf Hitler? What would Apaches with modern weapons be like? Will our modern civilization ever fall like civilizations from past eras? This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</itunes:summary>
       <itunes:subtitle>This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</itunes:subtitle>
       <link>http://www.dancarlin.com</link>

                  <pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>



                  <language>en-us</language>

                                   <managingEditor>dan@dancarlin.com (Dan Carlin)</managingEditor>
                                   <webMaster>dan@dancarlin.com (Dan Carlin)</webMaster>

                            <itunes:author>Dan Carlin</itunes:author>
                                   <copyright>dancarlin.com</copyright>
                                   <itunes:image href="http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg" />
                                   <image><url>http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg</url>
                                   <link>http://www.dancarlin.com</link><title>Dan Carlin's Hardcore History</title></image>
                                   <itunes:owner>





                              <itunes:name>Dan Carlin's Hardcore History</itunes:name>
                              <itunes:email>dan@dancarlin.com </itunes:email>
                              </itunes:owner>
                              <itunes:keywords>History, Military, War, Ancient, Archaeology, Classics, Carlin</itunes:keywords>
                              <itunes:category text="History" />
                              <itunes:explicit>no</itunes:explicit>




<atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="self" type="application/rss+xml" href="http://feeds.feedburner.com/dancarlin/history" /><feedburner:info xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0" uri="dancarlin/history" /><atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="hub" href="http://pubsubhubbub.appspot.com/" /><item>
<title>Show 67 - Supernova in the East VI</title>
<itunes:title>Supernova in the East VI</itunes:title>
<itunes:episode>67</itunes:episode>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3</guid>
<description>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</description>
<itunes:subtitle>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</itunes:subtitle>
<itunes:summary>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</itunes:summary>
<link>http://www.dancarlin.com/product/hardcore-history-67-Supernova-in-the-East-vi</link>
<pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3" length="250137274" type="audio/mpeg" />
<itunes:duration>05:45:52</itunes:duration>
<itunes:keywords> Japan, China, second world war, world war two, Pacific, Burma, India, Pelleliu, Layte Gulf, Iwo Jima, Marines, Churchill, Truman, Okinawa, Firebomb, war, naval, LeMay, Suicide, Kamikaze,
</itunes:keywords>
</item>



<item>
<title>Show 66 - Supernova in the East V</title>
<itunes:title>Supernova in the East V</itunes:title>
<itunes:episode>66</itunes:episode>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3</guid>
<description>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</description>
<itunes:subtitle>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</itunes:subtitle>
<itunes:summary>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</itunes:summary>
<link>http://www.dancarlin.com/product/hardcore-history-66-Supernova-in-the-East-v</link>
<pubDate>Fri, 13 Nov 2020 17:08:26 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3" length="154515612" type="audio/mpeg" />
<itunes:duration>03:32:34</itunes:duration>
<itunes:keywords> Japan, China, Asia, second world war, world war two, Pacific, Tarawa, Saipan, New Guinea, Guadalcanal, Marines, U.S., Australia, history, war, naval, amphibious, Suicide, history, podcast
</itunes:keywords>
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
       <itunes:summary>In "Hardcore History" journalist and broadcaster Dan Carlin takes his "Martian", unorthodox way of thinking and applies it to the past. Was Alexander the Great as bad a person as Adolf Hitler? What would Apaches with modern weapons be like? Will our modern civilization ever fall like civilizations from past eras? This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</itunes:summary>
       <itunes:subtitle>This isn't academic history (and Carlin isn't a historian) but the podcast's unique blend of high drama, masterful narration and Twilight Zone-style twists has entertained millions of listeners.</itunes:subtitle>
       <link>http://www.dancarlin.com</link>

                  <pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>



                  <language>en-us</language>

                                   <managingEditor>dan@dancarlin.com (Dan Carlin)</managingEditor>
                                   <webMaster>dan@dancarlin.com (Dan Carlin)</webMaster>

                            <itunes:author>Dan Carlin</itunes:author>
                                   <copyright>dancarlin.com</copyright>
                                   <itunes:image href="http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg" />
                                   <image><url>http://www.dancarlin.com/graphics/DC_HH_iTunes.jpg</url>
                                   <link>http://www.dancarlin.com</link><title>Dan Carlin's Hardcore History</title></image>
                                   <itunes:owner>





                              <itunes:name>Dan Carlin's Hardcore History</itunes:name>
                              <itunes:email>dan@dancarlin.com </itunes:email>
                              </itunes:owner>
                              <itunes:keywords>History, Military, War, Ancient, Archaeology, Classics, Carlin</itunes:keywords>
                              <itunes:category text="History" />
                              <itunes:explicit>no</itunes:explicit>




<atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="self" type="application/rss+xml" href="http://feeds.feedburner.com/dancarlin/history" /><feedburner:info xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0" uri="dancarlin/history" /><atom10:link xmlns:atom10="http://www.w3.org/2005/Atom" rel="hub" href="http://pubsubhubbub.appspot.com/" /><item>
<title>Show 67 - Supernova in the East VI</title>
<itunes:title>Supernova in the East VI</itunes:title>
<itunes:episode>67</itunes:episode>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3</guid>
<description>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</description>
<itunes:subtitle>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</itunes:subtitle>
<itunes:summary>When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.</itunes:summary>
<link>http://www.dancarlin.com/product/hardcore-history-67-Supernova-in-the-East-vi</link>
<pubDate>Tue, 8 Jun 2021 15:20:35 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3" length="250137274" type="audio/mpeg" />
<itunes:duration>05:45:52</itunes:duration>
<itunes:keywords> Japan, China, second world war, world war two, Pacific, Burma, India, Pelleliu, Layte Gulf, Iwo Jima, Marines, Churchill, Truman, Okinawa, Firebomb, war, naval, LeMay, Suicide, Kamikaze,
</itunes:keywords>
</item>



<item>
<title>Show 66 - Supernova in the East V</title>
<itunes:title>Supernova in the East V</itunes:title>
<itunes:episode>66</itunes:episode>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3</guid>
<description>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</description>
<itunes:subtitle>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</itunes:subtitle>
<itunes:summary>Can suicidal bravery and fanatical determination make up for material, industrial and numerical insufficiency? As the Asia-Pacific conflict turns against the Japanese these questions are put to the test. The results are nightmarish.</itunes:summary>
<link>http://www.dancarlin.com/product/hardcore-history-66-Supernova-in-the-East-v</link>
<pubDate>Fri, 13 Nov 2020 17:08:26 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha66_Supernova_in_the_East_V.mp3" length="154515612" type="audio/mpeg" />
<itunes:duration>03:32:34</itunes:duration>
<itunes:keywords> Japan, China, Asia, second world war, world war two, Pacific, Tarawa, Saipan, New Guinea, Guadalcanal, Marines, U.S., Australia, history, war, naval, amphibious, Suicide, history, podcast
</itunes:keywords>
</item>

<item>
<title>Show 65 - Supernova in the East IV</title>
<itunes:title>Supernova in the East IV</itunes:title>
<itunes:episode>65</itunes:episode>
<guid>http://traffic.libsyn.com/dancarlinhh/dchha65_Supernova_in_the_East_IV.mp3</guid>
<description>Coral Sea, Midway and Guadalcanal are three of the most famous battles of the Second World War. Together they will shift the momentum in the Pacific theater and usher in the era of modern naval and amphibious warfare.</description>
<itunes:subtitle>Coral Sea, Midway and Guadalcanal are three of the most famous battles of the Second World War. Together they will shift the momentum in the Pacific theater and usher in the era of modern naval and amphibious warfare.</itunes:subtitle>
<itunes:summary>Coral Sea, Midway and Guadalcanal are three of the most famous battles of the Second World War. Together they will shift the momentum in the Pacific theater and usher in the era of modern naval and amphibious warfare.</itunes:summary>
<link>http://www.dancarlin.com/product/hardcore-history-65-Supernova-in-the-East-iv</link>
<pubDate>Wed, 3 Jun 2020 15:20:44 PST</pubDate>
<enclosure url="http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha65_Supernova_in_the_East_IV.mp3" length="174313810" type="audio/mpeg" />
<itunes:duration>03:58:33</itunes:duration>
<itunes:keywords> Midway, Guadalcanal, Tulagi, Marines, Japanese, naval, Coral Sea, Admiral Earnest King, Douglas MacArthur, New Guinea, Australia, interservice rivalry, aircraft carriers, Japanese internment, history, Pacific, Second World War, Asia
</itunes:keywords>
</item>
</channel>

</rss>
`

func TestParser_Parse(t *testing.T) {
	podcast, err := parsePodcastRss(testData, "https://test123")
	assert.Empty(t, err)
	assert.Equal(t, "Dan Carlin's Hardcore History", podcast.Name)
	assert.Equal(t, "c81d442464cc19295f94a97e95d762c3", podcast.Id)
	assert.Equal(t, 2, len(podcast.episodesMap))
	assert.Equal(t, &Episode{
		Name:             "Show 67 - Supernova in the East VI",
		Id:               "6e50678087dc4fc44ad8f23e4d30de94",
		Description:      "When do spirit, tenacity, resilience and bravery cross into madness? When cities are incinerated? When suicide attacks become the norm? When atomic weapons are used? Japan's leaders test the limits of national endurance in the war's last year.",
		AudioFile:        "http://dts.podtrac.com/redirect.mp3/traffic.libsyn.com/dancarlinhh/dchha67_Supernova_in_the_East_VI.mp3",
		Length:           250137274,
		PublishTimestamp: 1623165635,
	},
		podcast.episodesMap["6e50678087dc4fc44ad8f23e4d30de94"])
}

func TestSyncNewData(t *testing.T) {
	podcast, _ := parsePodcastRss(testData, "https://test123")

	err := podcast.syncNewData(testDataWithUpdate)

	assert.Nil(t, err)
	assert.Equal(t, 3, len(podcast.episodesMap))
	assert.Equal(t, 3, len(podcast.Episodes))
}
