import { createRef, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Grommet, Box, Heading, Paragraph, Button, Text } from 'grommet'
import { Previous, Play, Pause } from 'grommet-icons'
import { Cast } from 'react-feather';
import AudioPlayer from 'react-h5-audio-player'
import Switch from "react-switch"
import { useCast, useMedia } from 'react-chromecast'
import './custom-player.scss'
import { theme, background, cardBackground } from '../theme'
import { useKeyPress } from '../utils'


export function PlayPodcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const player = createRef()
  const cast = useCast({
      initialize_media_player: "DEFAULT_MEDIA_RECEIVER_APP_ID",
      auto_initialize: true,
  })
  const chromecastMedia = useMedia()


  useKeyPress("Space", () => {
      if (cast.isConnect) {
        return
      }
      const controlls = player.current.audio.current
      if (controlls.paused) {
        controlls.play()
      } else {
        controlls.pause()
      }
  })

  useKeyPress("ArrowRight", () => {
    if (cast.isConnect) {
      return
    }
    player.current.handleClickForward()
  })
  useKeyPress("ArrowLeft", () => {
    if (cast.isConnect) {
      return
    }
    player.current.handleClickRewind()
  })

  const [episode, setEpisode] = useState(null)
  const [podcast, setPodcast] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [autoPlay, setAutoPlay] = useState(false)
  const [chromecastPlaying, setChromecastPlaying] = useState(false)

  useEffect(() => {
      let newEpisode = null
      let newPodcast = null
      // Check if state exists
      if (location.state === null 
        || location.state.episode === null 
        || location.state.podcast === null) {
          const epFromStorage = localStorage.getItem('currentEpisode')
          const podcastFromStorage = localStorage.getItem('currentPodcast')

          if (epFromStorage === null || podcastFromStorage === null) {
            window.location.href = "/"
          }

          newEpisode = JSON.parse(epFromStorage)
          newPodcast = JSON.parse(podcastFromStorage)
    } else {
      newPodcast = location.state.podcast
      newEpisode = location.state.episode
      setEpisodes(location.state.episodes)
      localStorage.setItem('currentEpisode', JSON.stringify(newEpisode))
      localStorage.setItem('currentPodcast', JSON.stringify(newPodcast))
    }


    setEpisode(newEpisode)
    setPodcast(newPodcast)


  }, [])



  const handleChromecast = useCallback(async () => {
      if(cast.castReceiver) {
          await cast.handleConnection()
          setChromecastPlaying(false)
          console.log(cast)
      }
  }, [cast.castReceiver, cast.handleConnection])

  const playCast = useCallback(async () => {
    setChromecastPlaying(true)
    if (chromecastMedia) {
      if (chromecastMedia.isMedia) {
        chromecastMedia.play()
      } else {
        await chromecastMedia.playMedia(`${window.location.protocol}//${window.location.hostname}/podcasts/${podcast.id}/episodes/${episode.id}/stream`)
      }

      console.log(cast)
    }
    setChromecastPlaying(true)
  }, [chromecastMedia])

  const pauseCast = useCallback(async () => {
    setChromecastPlaying(false)
    if (chromecastMedia) {
      await chromecastMedia.pause()
    }
    setChromecastPlaying(false)
  }, [chromecastMedia])



  if (episode === null || podcast === null) {
    return <Grommet full theme={theme}>
      <Box align="start" justify="center" pad="small" background={background} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto"/>
    </Grommet>
  }

  function setMediaMetadata() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: episode.name,
        artist: podcast.name,
        artwork: [
          { src: `/podcasts/${podcast.id}/image` }
        ]
      })
      navigator.mediaSession.setActionHandler('play', () => {
        player.current.audio.current.play()
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        player.current.audio.current.pause()
      })
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        player.current.handleClickRewind()
      })
      navigator.mediaSession.setActionHandler('seekforward', () => {
        player.current.handleClickForward()
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        player.current.handleClickRewind()
      })
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        player.current.handleClickForward()
      })
    }
  }

  let audioPlayer = null
  let playIcon = null
  if (chromecastPlaying) {
    playIcon = <Pause/>
  } else {
    playIcon = <Play/>
  }

  if (cast.isConnect) {
    audioPlayer = <Box>
      <Button onClick={() => {
        if (chromecastPlaying) {
          pauseCast() 
        } else {
          playCast()
        }
      }} justify="start" icon={playIcon}/>

    </Box>
  } else {
    audioPlayer = <AudioPlayer
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
              onLoadedMetaData={e => {
                // Check saved play point
                const startTime = localStorage.getItem(`${podcast.id}/${episode.id}`)

                if (startTime !== undefined) {
                  player.current.audio.current.currentTime = startTime
                }

                setMediaMetadata()

              }}
              onPlay={e => {
                setMediaMetadata()
              }}
              onEnded={e => {
                // Handle auto play if enabled
                if (!autoPlay) {
                  return
                }
                if (episodes.length > 0) {
                  let idx = 0

                  for (let i=episodes.length-1; i >= 0; i--) {
                    if (episodes[i].id === episode.id) {
                      idx = i
                      break
                    }
                  }

                  idx -= 1
                  if (idx >= 0) {
                    setEpisode(episodes[idx])
                    
                  }
                }
              }}
              customAdditionalControls={[]}
              hasDefaultKeyBindings={false}
              ref={player}
            />
  }




  return (

    <Grommet full theme={theme}>
      <Box align="start" justify="center" pad="small" background={background} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">
        <Box justify="center" align="start" justify="between" fill="horizontal" direction="row">
          <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />}/>
          <Box justify="end" pad="medium" direction="row">
            <Text margin={{"right": "small"}}>
              AutoPlay
            </Text>
            <Switch justify="end"  onChange={e => {
                setAutoPlay(e)
            }} checked={autoPlay} activeBoxShadow="0 0 1px 3px grey"/>
            <Button onClick={handleChromecast} icon={<Cast margin="0px" />} plain={true} margin={{left: "small"}}/>
          </Box>
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
          {audioPlayer}
        </Box>

      </Box>

    </Grommet>
  )
}
