/* global cast, chrome */
import { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Grommet, Box, Heading, Paragraph, Button, Text } from 'grommet'
import { Previous, Play, Pause } from 'grommet-icons'
import { Cast } from 'react-feather'
import AudioPlayer from 'react-h5-audio-player'
import Switch from 'react-switch'
import './custom-player.scss'
import { theme, background, cardBackground } from '../theme'
import { useKeyPress, getClientInfo, setClientInfo } from '../utils'
import { useChromecast } from './useChromecast'


export function PlayPodcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const { podcastId, episodeId } = useParams()
  const [player, setPlayer] = useState(null)

  const { isAvailable, isConnected, isPaused, requestSession, loadMedia, playOrPause } = useChromecast()

  const [episode, setEpisode] = useState(null)
  const [podcast, setPodcast] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [autoPlay, setAutoPlay] = useState(false)

  useEffect(async () => {
    if (location.state !== null
      && location.state.episode !== null
      && location.state.podcast !== null) {
      setPodcast(location.state.podcast)
      setEpisode(location.state.episode)
      setEpisodes(location.state.episodes || [])
      return
    }

    fetch(`/podcasts/${podcastId}`)
      .then(res => res.json())
      .then(data => {
        setPodcast(data)
        const eps = data.episodes || []
        setEpisodes(eps)
        const ep = eps.find(e => e.id === episodeId)
        if (ep) {
          setEpisode(ep)
        } else {
          window.location.href = '/'
        }
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  // When cast connects, load the current episode on the receiver
  useEffect(() => {
    if (isConnected && podcast && episode) {
      loadMedia(
        `${window.location.protocol}//${window.location.hostname}/podcasts/${podcast.id}/episodes/${episode.id}/stream`,
        {
          title: episode.name,
          artist: podcast.name,
          artwork: `${window.location.protocol}//${window.location.hostname}/podcasts/${podcast.id}/image`,
        }
      )
    }
  }, [isConnected, podcast, episode])

  useKeyPress('Space', [player], () => {
    if (isConnected) {
      playOrPause()
      return
    }
    const ctrl = player?.audio?.current
    if (!ctrl) return
    ctrl.paused ? ctrl.play() : ctrl.pause()
  })

  useKeyPress('ArrowRight', [player], () => {
    if (!isConnected) player?.handleClickForward()
  })
  useKeyPress('ArrowLeft', [player], () => {
    if (!isConnected) player?.handleClickRewind()
  })

  if (episode === null || podcast === null) {
    return (
      <Grommet full theme={theme}>
        <Box align="start" justify="center" pad="small" background={background}
          height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto" />
      </Grommet>
    )
  }

  function setMediaMetadata() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: episode.name,
      artist: podcast.name,
      artwork: [{ src: `/podcasts/${podcast.id}/image` }],
    })
    navigator.mediaSession.setActionHandler('play', () => player?.audio?.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => player?.audio?.current?.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => player?.handleClickRewind())
    navigator.mediaSession.setActionHandler('seekforward', () => player?.handleClickForward())
    navigator.mediaSession.setActionHandler('previoustrack', () => player?.handleClickRewind())
    navigator.mediaSession.setActionHandler('nexttrack', () => player?.handleClickForward())
  }

  const audioFile = `/podcasts/${podcast.id}/episodes/${episode.id}/stream`

  let audioPlayer
  if (isConnected) {
    audioPlayer = (
      <Box align="center" direction="row" gap="small">
        <Button
          icon={isPaused ? <Play /> : <Pause />}
          onClick={playOrPause}
          size="large"
        />
        <Text color="text-weak">Playing on Cast device</Text>
      </Box>
    )
  } else {
    audioPlayer = (
      <AudioPlayer
        autoPlay={true}
        src={audioFile}
        onListen={async e => {
          if (!e.target.src) return
          await setClientInfo(`${podcast.id}-${episode.id}`, e.target.currentTime)
        }}
        listenInterval={1000}
        onLoadStart={async e => {
          const startTime = await getClientInfo(`${podcast.id}-${episode.id}`)
          if (startTime !== null) e.target.currentTime = Number(startTime)
          setMediaMetadata()
        }}
        onPlay={() => setMediaMetadata()}
        onEnded={() => {
          if (!autoPlay || episodes.length === 0) return
          let idx = episodes.findIndex(e => e.id === episode.id)
          idx -= 1
          if (idx >= 0) setEpisode(episodes[idx])
        }}
        customAdditionalControls={[]}
        hasDefaultKeyBindings={false}
        ref={ele => setPlayer(ele)}
      />
    )
  }

  return (
    <Grommet full theme={theme}>
      <link rel="preload" as="audio" href={audioFile} />
      <Box align="start" justify="center" pad="small" background={background}
        height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">

        <Box justify="between" align="center" fill="horizontal" direction="row">
          <Button onClick={() => navigate(-1)} icon={<Previous />} />
          <Box justify="end" pad="medium" direction="row" align="center" gap="small">
            <Text>AutoPlay</Text>
            <Switch
              onChange={e => setAutoPlay(e)}
              checked={autoPlay}
              activeBoxShadow="0 0 1px 3px grey"
            />
            {isAvailable && (
              <Button
                onClick={requestSession}
                icon={<Cast size={20} color={isConnected ? '#4285F4' : undefined} />}
                plain={true}
                title={isConnected ? 'Connected to Cast device' : 'Cast to device'}
              />
            )}
          </Box>
        </Box>

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
            <Heading level="3" size="medium" margin="xsmall" textAlign="center">
              {episode.name}
            </Heading>
            <Paragraph size="small" margin="medium" textAlign="center">
              {episode.description.replace(/(<([^>]+)>)/gi, '')}
            </Paragraph>
          </Box>
        </Box>

        <Box align="center" pad="small" background={cardBackground} round="medium"
          margin="medium" direction="column" alignSelf="center"
          animation={{ type: 'fadeIn', size: 'medium' }} justify="end" fill="horizontal">
          {audioPlayer}
        </Box>

      </Box>
    </Grommet>
  )
}
