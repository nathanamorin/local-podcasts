import React from 'react'
import { useLocation } from 'react-router-dom';
import { Grommet, Box, Heading, Paragraph } from 'grommet'

import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { theme, background, cardBackground } from '../theme'


export function PlayPodcast() {
  const location = useLocation()

  let podcast = null
  let episode = null

  // Check if state exists
  if (location.state === null 
      || location.state.episode === null 
      || location.state.podcast === null) {
        episode = localStorage.getItem('currentEpisode')
        podcast = localStorage.getItem('currentPodcast')

        if (episode === null || podcast === null) {
          window.location.href = "/"
          return
        }

        episode = JSON.parse(episode)
        podcast = JSON.parse(podcast)
  } else {
    podcast = location.state.podcast
    episode = location.state.episode
    localStorage.setItem('currentEpisode', JSON.stringify(episode))
    localStorage.setItem('currentPodcast', JSON.stringify(podcast))
  }


  let startTime = localStorage.getItem(`${podcast.id}/${episode.id}`)
  if (startTime === undefined) {
    startTime = 0
  }

  return (

    <Grommet full theme={theme}>
      <Box align="start" justify="center" pad="small" background={background} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">

        <Box align="center" pad="small" background={cardBackground} round="medium" elevation="xlarge" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
          <Box align="center" justify="center" pad="xsmall" margin="xsmall">
            <Box align="center" justify="center" background={{ "dark": false, "color": "light-2", "image": `url('/podcasts/${podcast.id}/image')` }} round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
            <Heading level="2" size="medium" margin="xsmall" textAlign="center">
              {podcast.name}
            </Heading>
            <Heading level="3" size="medium" margin="xsmall" textAlign="center">
              {episode.name}
            </Heading>
            <Paragraph size="small" margin="medium" textAlign="center">
              {episode.description.replace(/(<([^>]+)>)/gi, "")}
            </Paragraph>
          </Box>
        </Box>

        <Box align="center" pad="small" background={cardBackground} round="medium" elevation="xlarge" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }} justify="end" fill="horizontal">
          <AudioPlayer
            autoPlay
            src={`/podcasts/${podcast.id}/episodes/${episode.id}/stream`}
            onListen={e => {
              localStorage.setItem(`${podcast.id}/${episode.id}`, e.target.currentTime)
            }}
            onLoadedMetaData={e => {
              e.target.currentTime = startTime
            }}
            customAdditionalControls={[]}
          />
        </Box>

      </Box>

    </Grommet>
  )
}
