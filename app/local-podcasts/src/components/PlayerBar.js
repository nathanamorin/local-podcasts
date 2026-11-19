import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, CheckBox, Text } from 'grommet'
import { Play, Pause, Next } from 'grommet-icons'
import { Cast } from 'react-feather'
import AudioPlayer from 'react-h5-audio-player'
import 'react-h5-audio-player/lib/styles.css'
import { usePlayer } from '../PlayerContext'
import { useChromecast } from '../pages/podcast/useChromecast'
import { getClientInfo, setClientInfo, getAdSkipEnabled, setAdSkipEnabled } from '../pages/utils'
import { theme, cardBackground } from '../pages/theme'

const PLAYER_HEIGHT = '130px'

// Merges overlapping/adjacent [start, end] ranges so playback only ever
// needs to check/skip a single range at a time.
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

export function PlayerBar() {
  const { currentPodcast, currentEpisode, queue, setShowQueue, playNext } = usePlayer()
  const { isAvailable, isConnected, isPaused, requestSession, loadMedia, playOrPause } = useChromecast()
  const playerRef = useRef(null)
  const [adSkipEnabled, setAdSkipEnabledState] = useState(getAdSkipEnabled())
  const [adRanges, setAdRanges] = useState([])

  // Load detected ad segments for the current episode so they can be
  // auto-skipped during playback. Ad detection is best-effort (audio
  // fingerprint matching across episodes), so this silently yields no
  // ranges until enough episodes have been fingerprinted.
  useEffect(() => {
    if (!currentEpisode) {
      setAdRanges([])
      return
    }
    let cancelled = false
    fetch(`/ads/candidates?episode_id=${encodeURIComponent(currentEpisode.id)}`)
      .then(r => r.ok ? r.json() : { candidates: [] })
      .then(data => {
        if (cancelled) return
        const ranges = (data.candidates || []).map(c => (
          c.episode_a_id === currentEpisode.id
            ? { start: c.start_a_sec, end: c.end_a_sec }
            : { start: c.start_b_sec, end: c.end_b_sec }
        ))
        setAdRanges(mergeRanges(ranges))
      })
      .catch(() => { if (!cancelled) setAdRanges([]) })
    return () => { cancelled = true }
  }, [currentEpisode?.id])

  function toggleAdSkip(enabled) {
    setAdSkipEnabledState(enabled)
    setAdSkipEnabled(enabled)
  }

  // When the player reports the current time, skip past any ad range the
  // playhead has entered.
  function handleTimeUpdate(audio) {
    if (!adSkipEnabled || adRanges.length === 0 || !audio) return
    const t = audio.currentTime
    const range = adRanges.find(r => t >= r.start && t < r.end)
    if (range) {
      audio.currentTime = range.end
    }
  }

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
          handleTimeUpdate(e.target)
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
          <CheckBox
            toggle
            checked={adSkipEnabled}
            onChange={e => toggleAdSkip(e.target.checked)}
            label={<Text size="xsmall" color="text-weak">Skip Ads</Text>}
            title={adSkipEnabled ? 'Ad skipping enabled - click to disable' : 'Ad skipping disabled - click to enable'}
          />
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
