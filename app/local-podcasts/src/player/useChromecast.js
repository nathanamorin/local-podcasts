/* global cast, chrome */
import { useState, useEffect, useCallback, useRef } from 'react'

// Module-level guard so CastContext is only configured once per page load
let castInitialized = false

function initCastContext() {
  if (castInitialized || !window.cast?.framework) return
  castInitialized = true
  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  })
}

// Wraps the Google Cast sender SDK: availability, session state, and a
// remote player whose paused/time/duration are mirrored into React state
// so the same transport UI can drive either local audio or a Cast device.
export function useChromecast() {
  const [castState, setCastState] = useState(
    () => window.cast?.framework
      ? cast.framework.CastContext.getInstance().getCastState()
      : 'NO_DEVICES_AVAILABLE'
  )
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [deviceName, setDeviceName] = useState('')

  const playerRef = useRef(null)
  const pcRef = useRef(null)

  useEffect(() => {
    function setup() {
      initCastContext()
      const ctx = cast.framework.CastContext.getInstance()
      if (!playerRef.current) {
        playerRef.current = new cast.framework.RemotePlayer()
        pcRef.current = new cast.framework.RemotePlayerController(playerRef.current)
      }

      const syncSession = () => {
        const session = ctx.getCurrentSession()
        setIsConnected(!!session)
        setDeviceName(session?.getCastDevice()?.friendlyName || '')
      }
      setCastState(ctx.getCastState())
      syncSession()

      const { RemotePlayerEventType, CastContextEventType } = cast.framework
      const onCastState = (e) => setCastState(e.castState)
      const onSessionState = () => syncSession()
      const onPaused = () => setIsPaused(playerRef.current.isPaused)
      const onTime = () => setCurrentTime(playerRef.current.currentTime || 0)
      const onDuration = () => setDuration(playerRef.current.duration || 0)

      ctx.addEventListener(CastContextEventType.CAST_STATE_CHANGED, onCastState)
      ctx.addEventListener(CastContextEventType.SESSION_STATE_CHANGED, onSessionState)
      const pc = pcRef.current
      pc.addEventListener(RemotePlayerEventType.IS_PAUSED_CHANGED, onPaused)
      pc.addEventListener(RemotePlayerEventType.CURRENT_TIME_CHANGED, onTime)
      pc.addEventListener(RemotePlayerEventType.DURATION_CHANGED, onDuration)

      return () => {
        ctx.removeEventListener(CastContextEventType.CAST_STATE_CHANGED, onCastState)
        ctx.removeEventListener(CastContextEventType.SESSION_STATE_CHANGED, onSessionState)
        pc.removeEventListener(RemotePlayerEventType.IS_PAUSED_CHANGED, onPaused)
        pc.removeEventListener(RemotePlayerEventType.CURRENT_TIME_CHANGED, onTime)
        pc.removeEventListener(RemotePlayerEventType.DURATION_CHANGED, onDuration)
      }
    }

    if (window.cast?.framework) return setup()

    // SDK not yet loaded — chain into the global callback
    const prev = window.__onGCastApiAvailable
    let cleanup = () => {}
    window.__onGCastApiAvailable = (available) => {
      if (prev) prev(available)
      if (available) cleanup = setup() || (() => {})
    }
    return () => cleanup()
  }, [])

  const isAvailable = castState !== 'NO_DEVICES_AVAILABLE'

  const requestSession = useCallback(() => {
    if (!window.cast?.framework) return
    cast.framework.CastContext.getInstance().requestSession().catch(() => {})
  }, [])

  const endSession = useCallback(() => {
    cast.framework.CastContext.getInstance().getCurrentSession()?.endSession(true)
  }, [])

  const loadMedia = useCallback(async (url, metadata = {}, startAt = 0, rate = 1) => {
    if (!window.cast?.framework) return
    const session = cast.framework.CastContext.getInstance().getCurrentSession()
    if (!session) return

    const mediaInfo = new chrome.cast.media.MediaInfo(url, 'audio/mpeg')
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED
    const meta = new chrome.cast.media.MusicTrackMediaMetadata()
    meta.title = metadata.title || ''
    meta.artist = metadata.artist || ''
    if (metadata.artwork) meta.images = [new chrome.cast.Image(metadata.artwork)]
    mediaInfo.metadata = meta

    const request = new chrome.cast.media.LoadRequest(mediaInfo)
    request.autoplay = true
    request.currentTime = startAt
    if (rate !== 1) request.playbackRate = rate

    try {
      await session.loadMedia(request)
    } catch (err) {
      console.error('Cast loadMedia error:', err)
    }
  }, [])

  const playOrPause = useCallback(() => {
    if (pcRef.current?.player?.canPause) pcRef.current.playOrPause()
  }, [])

  const seek = useCallback((seconds) => {
    const p = playerRef.current
    if (!p?.canSeek) return
    p.currentTime = seconds
    pcRef.current.seek()
  }, [])

  return {
    isAvailable, isConnected, isPaused, currentTime, duration, deviceName,
    requestSession, endSession, loadMedia, playOrPause, seek,
  }
}
