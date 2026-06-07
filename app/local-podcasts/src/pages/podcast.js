import React, { useState, useEffect } from 'react'
import { Grommet, Box, Drop, InfiniteScroll, Button, Text, Heading, Paragraph, TextInput } from 'grommet'
import { Play, Previous } from 'grommet-icons'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { theme, background, cardBackground } from './theme'
import { getClientInfo, setClientInfo, deleteClientInfo } from './utils'
import { usePlayer } from '../PlayerContext'


export function Podcast() {
  const { podcastId } = useParams()
  const navigate = useNavigate()
  const { currentEpisode, playNow, addToQueue } = usePlayer()

  const [podcast, setPodcast] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [playedEpisodes, setPlayedEpisode] = useState({})
  const [searchText, setSearchText] = useState('')
  const [queuePrompt, setQueuePrompt] = useState(null)

  const playedEpisodesKey = `played-episodes-${podcastId}`

  useEffect(async () => {
    fetch(`/podcasts/${podcastId}`)
      .then(data => data.json())
      .then(data => {
        setPodcast(data)
        setEpisodes(data.episodes || [])
      })
      .catch(err => console.log(err))

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
    <Grommet theme={theme}>
      <Box align="center" justify="center" pad="small" background={background}
        flex={false} direction="row" wrap overflow="auto">

        <Box justify="center" align="start" fill="horizontal">
          <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />} />
        </Box>

        {podcast && (
          <Box align="center" pad="small" background={cardBackground} round="medium"
            margin="medium" direction="column" alignSelf="center"
            animation={{ type: 'fadeIn', size: 'medium' }}>
            <Box align="center" justify="center" pad="xsmall" margin="xsmall">
              <Box align="center" justify="center"
                background={{ dark: false, color: 'light-2', image: `url('/podcasts/${podcast.id}/image')` }}
                round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
              <Heading level="2" size="medium" margin="xsmall" textAlign="center">
                {podcast.name}
              </Heading>
              <Paragraph size="small" margin="medium" textAlign="center">
                {podcast.description.replace(/(<([^>]+)>)/gi, '')}
              </Paragraph>
            </Box>
          </Box>
        )}

        <TextInput
          placeholder="Search"
          value={searchText}
          onChange={event => setSearchText(event.target.value)}
          focusIndicator={false}
        />

        <Box fill="horizontal" pad={{ top: 'medium' }}>
          <InfiniteScroll items={searchedEpisodes} pad="small">
            {(episode) => (
              <Box
                key={episode.id}
                align="center"
                justify="between"
                fill="horizontal"
                direction="row-responsive"
                margin={{ top: 'xxsmall' }}
                background={`linear-gradient(to right, ${theme.global.colors['grey!']} ${episode.percentPlayed}% , ${theme.global.colors['dark-2']}  ${episode.percentPlayed}% 100%)`}
              >
                <Box align="center" justify="start" direction="row" flex>
                  <Button
                    icon={<Play />}
                    size="large"
                    onClick={e => handlePlayClick(episode, e.currentTarget)}
                  />
                  <Link
                    to={`/podcast/${podcastId}/episode/${episode.id}`}
                    state={{ podcast, episode, episodes: searchedEpisodes }}
                    style={{ textDecoration: 'none', flex: 1, overflow: 'hidden' }}
                  >
                    <Box align="start" justify="start" direction="column" pad={{ horizontal: 'xsmall' }}>
                      <Text color="text" truncate>
                        {episode.name}
                      </Text>
                    </Box>
                  </Link>
                </Box>

                <Box align="center" justify="end" direction="row" flex={{ shrink: 0 }}>
                  <Text color="text-weak" size="small" margin={{ right: 'small' }}>
                    {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
                  </Text>
                </Box>
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
    </Grommet>
  )
}
