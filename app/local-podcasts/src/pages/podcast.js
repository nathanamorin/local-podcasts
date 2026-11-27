import React, { useContext, useState, useEffect, useRef, useCallback } from 'react'
import { Box, Drop, InfiniteScroll, Button, Text, Heading, ResponsiveContext, TextInput } from 'grommet'
import { Play, Search as SearchIcon } from 'grommet-icons'
import { Link, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { getClientInfo, setClientInfo, deleteClientInfo } from './utils'
import { usePlayer } from '../PlayerContext'

// How many episodes the backend returns per /podcasts/{id}/episodes page.
const PAGE_SIZE = 50

function stripHtml(html) {
  return (html || '').replace(/(<([^>]+)>)/gi, '')
}

export function Podcast() {
  const { podcastId } = useParams()
  const size = useContext(ResponsiveContext)
  const compact = size === 'small'
  const { currentEpisode, playNow, addToQueue } = usePlayer()

  const [podcast, setPodcast] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [playedEpisodes, setPlayedEpisode] = useState({})
  const [searchText, setSearchText] = useState('')
  const [queuePrompt, setQueuePrompt] = useState(null)

  const playedEpisodesKey = `played-episodes-${podcastId}`

  // Mirrors in-flight/has-more state in refs so loadMoreEpisodes - called
  // from InfiniteScroll's onMore - always sees the latest value rather than
  // one captured by an earlier render's closure.
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const nextPageRef = useRef(1)

  // Fetches the next page of this podcast's episodes and appends it.
  const loadMoreEpisodes = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) {
      return
    }
    loadingRef.current = true
    const page = nextPageRef.current

    fetch(`/podcasts/${podcastId}/episodes?page=${page}&page_size=${PAGE_SIZE}`)
      .then(data => data.json())
      .then(({ episodes: newEpisodes, pagination }) => {
        setEpisodes(prev => [...prev, ...newEpisodes])
        hasMoreRef.current = pagination.has_more
        nextPageRef.current = page + 1
      })
      .catch(err => console.log(err))
      .finally(() => {
        loadingRef.current = false
      })
  }, [podcastId])

  useEffect(async () => {
    fetch(`/podcasts/${podcastId}`)
      .then(data => data.json())
      .then(data => setPodcast(data))
      .catch(err => console.log(err))

    loadMoreEpisodes()

    const data = await getClientInfo(playedEpisodesKey)
    if (data != null) {
      let playedEpData = null
      try {
        playedEpData = JSON.parse(data)
        for (const id in playedEpData) {
          if (playedEpData[id] === null) {
            playedEpData[id] = await getClientInfo(`${podcastId}-${id}`)
          }
        }
      } catch (ex) {
        console.log(ex)
        playedEpData = {}
        await deleteClientInfo(playedEpisodesKey)
      }
      setPlayedEpisode(playedEpData)
    }
  }, [])

  function markPlayed(episode) {
    const newPlayed = { ...playedEpisodes }
    newPlayed[episode.id] = null
    setPlayedEpisode(newPlayed)
    setClientInfo(playedEpisodesKey, JSON.stringify(newPlayed))
  }

  function handlePlayClick(episode, buttonEl) {
    if (currentEpisode) {
      setQueuePrompt({ episode, target: buttonEl })
    } else {
      markPlayed(episode)
      playNow(podcast, episode)
    }
  }

  let searchedEpisodes
  if (searchText !== '') {
    searchedEpisodes = episodes.filter(x => x.name.toLowerCase().includes(searchText.toLowerCase()))
  } else {
    searchedEpisodes = episodes
  }

  searchedEpisodes = searchedEpisodes.map(x => {
    const lengthPlayed = playedEpisodes[x.id]
    if (lengthPlayed === undefined) {
      x.percentPlayed = 0
    } else {
      x.percentPlayed = x.audio_length_sec !== 0
        ? Math.round(lengthPlayed / x.audio_length_sec * 100)
        : 0
    }
    return x
  })

  return (
    <Box fill>
      <Header title={podcast?.name || ''} />

        {podcast && (
          <Box
            direction={compact ? 'column' : 'row'}
            align={compact ? 'center' : 'start'}
            gap="medium"
            pad="medium"
            flex={{ shrink: 0 }}
          >
            <Box
              width="160px"
              height="160px"
              round="small"
              flex={{ shrink: 0 }}
              background={{ color: 'background-contrast', image: `url('/podcasts/${podcast.id}/image')`, size: 'cover' }}
            />
            <Box gap="xsmall" align={compact ? 'center' : 'start'} style={{ maxWidth: '640px' }}>
              <Heading level="2" margin="none" textAlign={compact ? 'center' : 'start'}>
                {podcast.name}
              </Heading>
              <Text size="small" color="text-weak" textAlign="start">
                {stripHtml(podcast.description)}
              </Text>
            </Box>
          </Box>
        )}

        <Box
          direction="row"
          align="center"
          gap="small"
          pad={{ horizontal: 'medium', bottom: 'small' }}
          flex={{ shrink: 0 }}
        >
          <Heading level="4" margin="none">Episodes</Heading>
          <Box flex />
          <Box
            direction="row"
            align="center"
            gap="xsmall"
            background="background-contrast"
            round="small"
            pad={{ horizontal: 'small' }}
            width={{ max: '260px' }}
          >
            <SearchIcon size="small" color="text-xweak" />
            <TextInput
              placeholder="Search episodes"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              plain
              focusIndicator={false}
            />
          </Box>
        </Box>

        <Box pad={{ horizontal: 'medium', bottom: 'large' }} flex="grow" overflow="auto">
          <InfiniteScroll items={searchedEpisodes} onMore={loadMoreEpisodes}>
            {(episode) => (
              <Box
                key={episode.id}
                direction="row"
                align="center"
                gap="small"
                round="small"
                pad={{ vertical: 'xsmall', horizontal: 'xsmall' }}
                hoverIndicator="background-contrast"
                style={{ position: 'relative' }}
              >
                {episode.percentPlayed > 0 && (
                  <Box
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: 0,
                      height: '2px',
                      width: `${episode.percentPlayed}%`,
                      background: '#ff5a3c',
                      borderRadius: '2px',
                    }}
                  />
                )}
                <Button
                  icon={<Play size="medium" />}
                  onClick={e => handlePlayClick(episode, e.currentTarget)}
                  plain
                  hoverIndicator
                  style={{ padding: '8px', borderRadius: '999px', flexShrink: 0 }}
                />
                <Link
                  to={`/podcast/${podcastId}/episode/${episode.id}`}
                  state={{ podcast, episode, episodes: searchedEpisodes }}
                  style={{ textDecoration: 'none', flex: 1, overflow: 'hidden' }}
                >
                  <Box direction={compact ? 'column' : 'row'} align={compact ? 'start' : 'center'} gap={compact ? '2px' : 'small'}>
                    <Text color="text" truncate style={{ display: 'block', maxWidth: '100%' }}>
                      {episode.name}
                    </Text>
                    {compact && (
                      <Text color="text-weak" size="xsmall">
                        {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
                      </Text>
                    )}
                  </Box>
                </Link>

                {!compact && (
                  <Text color="text-weak" size="small" style={{ flexShrink: 0 }}>
                    {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
                  </Text>
                )}
              </Box>
            )}
          </InfiniteScroll>
        </Box>

        {queuePrompt && (
          <Drop
            target={queuePrompt.target}
            onClickOutside={() => setQueuePrompt(null)}
            onEsc={() => setQueuePrompt(null)}
            align={{ top: 'bottom', left: 'left' }}
            elevation="large"
          >
            <Box pad="xsmall" gap="xsmall" background="background-front" round="xsmall">
              <Button
                label="Play Now"
                onClick={() => {
                  markPlayed(queuePrompt.episode)
                  playNow(podcast, queuePrompt.episode)
                  setQueuePrompt(null)
                }}
              />
              <Button
                label="Add to Queue"
                onClick={() => {
                  addToQueue(podcast, queuePrompt.episode)
                  setQueuePrompt(null)
                }}
              />
            </Box>
          </Drop>
        )}
      </Box>
  )
}
