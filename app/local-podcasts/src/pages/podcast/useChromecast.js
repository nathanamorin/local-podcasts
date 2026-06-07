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

export function useChromecast() {
  const [castState, setCastState] = useState(
    () => window.cast?.framework
      ? cast.framework.CastContext.getInstance().getCastState()
      : 'NO_DEVICES_AVAILABLE'
  )
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

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

      // Reflect initial state (e.g., returning to page with active session)
      setCastState(ctx.getCastState())
      setIsConnected(!!ctx.getCurrentSession())

      const onCastState = (e) => setCastState(e.castState)
      const onSessionState = (e) => {
        const { SessionState } = cast.framework
        const connected =
          e.sessionState === SessionState.SESSION_STARTED ||
          e.sessionState === SessionState.SESSION_RESUMED
        setIsConnected(connected)
      }
      const onPaused = () => setIsPaused(playerRef.current.isPaused)

      ctx.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, onCastState)
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionState)
      pcRef.current.addEventListener(cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED, onPaused)

      return () => {
        ctx.removeEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, onCastState)
        ctx.removeEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionState)
        pcRef.current?.removeEventListener(cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED, onPaused)
      }
    }

    if (window.cast?.framework) {
      return setup()
    }

    // SDK not yet loaded — chain into the global callback
    const prev = window.__onGCastApiAvailable
    let cleanup = () => {}
    window.__onGCastApiAvailable = (available) => {
      if (prev) prev(available)
      if (available) cleanup = setup() || (() => {})
    }
    return () => cleanup()
  }, [])

  // isAvailable: Cast SDK knows about at least one device
  const isAvailable = castState !== 'NO_DEVICES_AVAILABLE'

  const requestSession = useCallback(() => {
    if (!window.cast?.framework) return
    cast.framework.CastContext.getInstance().requestSession()
  }, [])

  const loadMedia = useCallback(async (url, metadata = {}) => {
    if (!window.cast?.framework) return
    const session = cast.framework.CastContext.getInstance().getCurrentSession()
    if (!session) return

    const mediaInfo = new chrome.cast.media.MediaInfo(url, 'audio/mpeg')
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED

    const meta = new chrome.cast.media.MusicTrackMediaMetadata()
    meta.title = metadata.title || ''
    meta.artist = metadata.artist || ''
    if (metadata.artwork) {
      meta.images = [new chrome.cast.Image(metadata.artwork)]
    }
    mediaInfo.metadata = meta

    const request = new chrome.cast.media.LoadRequest(mediaInfo)
    request.autoplay = true

    try {
      await session.loadMedia(request)
    } catch (err) {
      console.error('Cast loadMedia error:', err)
    }
  }, [])

  const playOrPause = useCallback(() => {
    if (pcRef.current?.player?.canPause) {
      pcRef.current.playOrPause()
    }
  }, [])

  const endSession = useCallback(() => {
    cast.framework.CastContext.getInstance().getCurrentSession()?.endSession(true)
  }, [])

  return { isAvailable, isConnected, isPaused, castState, requestSession, loadMedia, playOrPause, endSession }
}
