import { createRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Grommet, Box, Heading, Paragraph, Button } from 'grommet'
import { Previous } from 'grommet-icons'
import AudioPlayer from 'react-h5-audio-player'
import './custom-player.scss'
import { theme, background, cardBackground } from '../theme'
import { useKeyPress } from '../utils'


export function PlayPodcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const player = createRef()


  useKeyPress("Space", () => {
      const controlls = player.current.audio.current
      if (controlls.paused) {
        controlls.play()
      } else {
        controlls.pause()
      }
  })

  useKeyPress("ArrowRight", () => {
    player.current.handleClickForward()
  })
  useKeyPress("ArrowLeft", () => {
    player.current.handleClickRewind()
  })

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
        }

        episode = JSON.parse(episode)
        podcast = JSON.parse(podcast)
  } else {
    podcast = location.state.podcast
    episode = location.state.episode
    localStorage.setItem('currentEpisode', JSON.stringify(episode))
    localStorage.setItem('currentPodcast', JSON.stringify(podcast))
  }

  const startTime = localStorage.getItem(`${podcast.id}/${episode.id}`)

  useEffect(() => {
      if (startTime !== undefined) {
        player.current.audio.current.currentTime = startTime
      }
  }, []);

  return (

    <Grommet full theme={theme}>
      <Box align="start" justify="center" pad="small" background={background} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">
        <Box justify="center" align="start" fill="horizontal">
          <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />}/>
        </Box>
        <Box align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
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

        <Box align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }} justify="end" fill="horizontal">
          <AudioPlayer
              autoPlay
              src={`/podcasts/${podcast.id}/episodes/${episode.id}/stream`}
              onListen={e => {
                // For some reason, this is called with a empty audio element 
                // when navigation is triggered, do some quick checks to prevent setting
                // a play time when this happens
                if (e.target.src === undefined || e.target.src === "") {
                  return
                }
                localStorage.setItem(`${podcast.id}/${episode.id}`, e.target.currentTime)
              }}
              customAdditionalControls={[]}
              hasDefaultKeyBindings={false}
              ref={player}
            />
        </Box>

      </Box>

    </Grommet>
  )
}
