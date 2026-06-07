import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, Text } from 'grommet'
import { Play, Pause, Next } from 'grommet-icons'
import { Cast } from 'react-feather'
import AudioPlayer from 'react-h5-audio-player'
import 'react-h5-audio-player/lib/styles.css'
import { usePlayer } from '../PlayerContext'
import { useChromecast } from '../pages/podcast/useChromecast'
import { getClientInfo, setClientInfo } from '../pages/utils'
import { theme, cardBackground } from '../pages/theme'

const PLAYER_HEIGHT = '130px'

export function PlayerBar() {
  const { currentPodcast, currentEpisode, queue, setShowQueue, playNext } = usePlayer()
  const { isAvailable, isConnected, isPaused, requestSession, loadMedia, playOrPause } = useChromecast()
  const playerRef = useRef(null)

  // When episode changes, load on Cast receiver if connected
  useEffect(() => {
    if (isConnected && currentPodcast && currentEpisode) {
      loadMedia(
        `${window.location.protocol}//${window.location.hostname}/podcasts/${currentPodcast.id}/episodes/${currentEpisode.id}/stream`,
        {
          title: currentEpisode.name,
          artist: currentPodcast.name,
          artwork: `${window.location.protocol}//${window.location.hostname}/podcasts/${currentPodcast.id}/image`,
        }
      )
    }
  }, [currentEpisode?.id, isConnected])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      // Avoid triggering when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const p = playerRef.current
      if (!p) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (isConnected) { playOrPause(); return }
        const audio = p.audio.current
        audio.paused ? audio.play() : audio.pause()
      }
      if (e.code === 'ArrowRight' && !isConnected) p.handleClickForward()
      if (e.code === 'ArrowLeft' && !isConnected) p.handleClickRewind()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isConnected, playOrPause])

  function setMediaSession() {
    if (!('mediaSession' in navigator) || !currentEpisode || !currentPodcast) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: currentEpisode.name,
      artist: currentPodcast.name,
      artwork: [{ src: `/podcasts/${currentPodcast.id}/image` }],
    })
    const p = playerRef.current
    if (!p) return
    navigator.mediaSession.setActionHandler('play', () => p.audio.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => p.audio.current?.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => p.handleClickRewind())
    navigator.mediaSession.setActionHandler('seekforward', () => p.handleClickForward())
    navigator.mediaSession.setActionHandler('previoustrack', () => p.handleClickRewind())
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (queue.length > 0) playNext()
      else p.handleClickForward()
    })
  }

  if (!currentEpisode || !currentPodcast) return null

  const audioFile = `/podcasts/${currentPodcast.id}/episodes/${currentEpisode.id}/stream`

  let controls
  if (isConnected) {
    controls = (
      <Box direction="row" align="center" gap="small" pad={{ horizontal: 'medium', bottom: 'small' }}>
        <Button icon={isPaused ? <Play /> : <Pause />} onClick={playOrPause} />
        {queue.length > 0 && (
          <Button icon={<Next />} onClick={playNext} tip="Play next in queue" />
        )}
        <Text color="text-weak" size="small">Casting to device</Text>
      </Box>
    )
  } else {
    controls = (
      <AudioPlayer
        autoPlay={true}
        src={audioFile}
        onListen={async e => {
          if (!e.target.src) return
          await setClientInfo(`${currentPodcast.id}-${currentEpisode.id}`, e.target.currentTime)
        }}
        listenInterval={1000}
        onLoadStart={async e => {
          const t = await getClientInfo(`${currentPodcast.id}-${currentEpisode.id}`)
          if (t !== null) e.target.currentTime = Number(t)
          setMediaSession()
        }}
        onPlay={() => setMediaSession()}
        onEnded={() => {
          if (queue.length > 0) playNext()
        }}
        customAdditionalControls={[
          queue.length > 0 && (
            <Button key="next" icon={<Next />} onClick={playNext} plain tip="Play next in queue" style={{ padding: '4px' }} />
          ),
        ]}
        hasDefaultKeyBindings={false}
        ref={playerRef}
        style={{ background: 'transparent', boxShadow: 'none' }}
      />
    )
  }

  return (
    <Box
      style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}
      background={cardBackground}
      border={{ side: 'top', color: 'border', size: 'xsmall' }}
      elevation="large"
    >
      {/* Episode info row */}
      <Box direction="row" align="center" justify="between" pad={{ horizontal: 'medium', top: 'small' }}>
        <Box direction="row" align="center" gap="small" flex>
          <Box
            width="40px"
            height="40px"
            round="xsmall"
            flex={{ shrink: 0 }}
            background={{
              color: 'light-2',
              image: `url('/podcasts/${currentPodcast.id}/image')`,
              size: 'cover',
            }}
          />
          <Box flex overflow="hidden">
            <Link
              to={`/podcast/${currentPodcast.id}/episode/${currentEpisode.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Text
                size="small"
                color="text"
                weight="bold"
                truncate
                style={{ display: 'block', maxWidth: '300px' }}
              >
                {currentEpisode.name}
              </Text>
            </Link>
            <Link
              to={`/podcast/${currentPodcast.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Text size="xsmall" color="text-weak" truncate style={{ display: 'block', maxWidth: '300px' }}>
                {currentPodcast.name}
              </Text>
            </Link>
          </Box>
        </Box>

        <Box direction="row" align="center" gap="xsmall" flex={{ shrink: 0 }}>
          {isAvailable && (
            <Button
              plain
              icon={<Cast size={18} color={isConnected ? '#4285F4' : theme.global.colors['text-weak']?.dark || '#ccc'} />}
              onClick={requestSession}
              title={isConnected ? 'Connected to Cast device' : 'Cast to device'}
            />
          )}
          <Button
            plain
            onClick={() => setShowQueue(v => !v)}
            title="Show queue"
            style={{ padding: '4px 8px', fontSize: '12px', color: '#ccc' }}
            label={queue.length > 0 ? `Queue (${queue.length})` : 'Queue'}
          />
        </Box>
      </Box>

      {/* Audio controls */}
      {controls}
    </Box>
  )
}

// How much bottom padding pages need to avoid being covered by the PlayerBar
export { PLAYER_HEIGHT }
