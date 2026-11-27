import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useChromecast } from './useChromecast'
import {
  getClientInfo, setClientInfo, safeGet, safeSet, safeGetJSON, safeSetJSON,
  positionKey, startedKey,
} from '../lib/storage'
import { imageUrl, episodeLength } from '../lib/format'

// Player state is split in two contexts: PlayerContext changes rarely
// (episode, queue, settings) while TimeContext ticks several times a second
// during playback. Splitting keeps every list/page that only needs
// "what's playing" from re-rendering on each timeupdate.
const PlayerContext = createContext(null)
const TimeContext = createContext({ currentTime: 0, duration: 0 })

export const SPEEDS = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2, 2.5, 3]
export const SKIP_BACK = 15
export const SKIP_FORWARD = 30
const SAVE_INTERVAL_MS = 5000
const FINISHED_THRESHOLD_SEC = 20
const HISTORY_LIMIT = 24
const PROGRESS_LIMIT = 600

export function streamUrl(podcastId, episodeId) {
  return `/podcasts/${podcastId}/episodes/${episodeId}/stream`
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  return merged
}

// Strip heavy fields before persisting episode/podcast objects locally.
function slimPodcast(p) {
  return p && { id: p.id, name: p.name }
}
function slimEpisode(e) {
  return e && {
    id: e.id,
    name: e.name,
    description: (e.description || '').slice(0, 3000),
    audio_length_sec: e.audio_length_sec,
    publish_timestamp: e.publish_timestamp,
  }
}
function slimEntry(entry) {
  return entry && { podcast: slimPodcast(entry.podcast), episode: slimEpisode(entry.episode) }
}

function isFinished(position, duration) {
  return duration > 0 && position >= duration - FINISHED_THRESHOLD_SEC
}

// Records that an episode has been started, in the per-show list the
// server-side client store keeps (wire-compatible with the previous UI).
async function recordStarted(podcastId, episodeId) {
  const raw = await getClientInfo(startedKey(podcastId))
  let data = {}
  try { data = raw ? JSON.parse(raw) || {} : {} } catch { data = {} }
  if (episodeId in data) return
  data[episodeId] = null
  setClientInfo(startedKey(podcastId), JSON.stringify(data))
}

export function PlayerProvider({ children }) {
  const audioRef = useRef(null)
  const cast = useChromecast()

  const session = useMemo(() => safeGetJSON('player-session', null), [])
  const [current, setCurrent] = useState(session?.current || null) // { podcast, episode }
  const [queue, setQueue] = useState(session?.queue || [])
  const [paused, setPaused] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [time, setTime] = useState({ currentTime: 0, duration: 0 })
  const [rate, setRateState] = useState(1)
  const [adSkip, setAdSkipState] = useState(safeGet('adSkipEnabled') !== 'false')
  const [adRanges, setAdRanges] = useState([])
  const [sleep, setSleepState] = useState(null) // null | { type: 'end' } | { type: 'time', endsAt }
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [toastState, setToastState] = useState(null)
  // episodeId -> { p: position sec, d: duration sec, t: updated ms, done }
  const [progress, setProgress] = useState(() => safeGetJSON('episode-progress', {}))
  const [history, setHistory] = useState(() => safeGetJSON('listening-history', []))

  // Refs mirror state for use inside media/DOM event handlers.
  const currentRef = useRef(current)
  const queueRef = useRef(queue)
  const adRangesRef = useRef(adRanges)
  const adSkipRef = useRef(adSkip)
  const sleepRef = useRef(sleep)
  const progressRef = useRef(progress)
  const pendingSeekRef = useRef(null)
  // Whether the user wants audio playing; drives automatic retry when the
  // stream isn't ready yet (the server answers 503 + Retry-After while it
  // (re)downloads an episode).
  const wantPlayRef = useRef(false)
  const retryRef = useRef({ count: 0, timer: null })
  const lastSaveRef = useRef(0)
  // Last position/duration reported by the <audio> element. Browsers reset
  // the element during page unload (before pagehide), so saves at that point
  // must not read audio.currentTime directly.
  const lastKnownRef = useRef({ t: 0, d: 0 })
  const castRef = useRef(cast)
  currentRef.current = current
  queueRef.current = queue
  adRangesRef.current = adRanges
  adSkipRef.current = adSkip
  sleepRef.current = sleep
  progressRef.current = progress
  castRef.current = cast

  // ---- toasts ----------------------------------------------------------
  const toastTimer = useRef(null)
  const toast = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToastState({ message, id: Date.now() })
    toastTimer.current = setTimeout(() => setToastState(null), 2600)
  }, [])

  // ---- progress persistence -------------------------------------------
  const updateProgress = useCallback((episodeId, podcastId, position, duration, done = null) => {
    setProgress(prev => {
      const next = { ...prev, [episodeId]: { p: position, d: duration, t: Date.now(), podcastId, done: done ?? isFinished(position, duration) } }
      const keys = Object.keys(next)
      if (keys.length > PROGRESS_LIMIT) {
        keys.sort((a, b) => (next[a].t || 0) - (next[b].t || 0))
        keys.slice(0, keys.length - PROGRESS_LIMIT).forEach(k => delete next[k])
      }
      safeSetJSON('episode-progress', next)
      return next
    })
  }, [])

  const savePosition = useCallback((force = false) => {
    const cur = currentRef.current
    if (!cur) return
    const c = castRef.current
    const audio = audioRef.current
    const position = c.isConnected ? c.currentTime : (audio?.currentTime || lastKnownRef.current.t)
    const duration = (c.isConnected ? c.duration : (audio?.duration || lastKnownRef.current.d)) || episodeLength(cur.episode) || 0
    if (!position && !force) return
    const now = Date.now()
    if (!force && now - lastSaveRef.current < SAVE_INTERVAL_MS) return
    lastSaveRef.current = now
    setClientInfo(positionKey(cur.podcast.id, cur.episode.id), position || 0)
    updateProgress(cur.episode.id, cur.podcast.id, position || 0, duration)
  }, [updateProgress])

  const pushHistory = useCallback((podcast, episode) => {
    setHistory(prev => {
      const next = [{ podcast: slimPodcast(podcast), episode: slimEpisode(episode), t: Date.now() },
        ...prev.filter(h => h.episode.id !== episode.id)].slice(0, HISTORY_LIMIT)
      safeSetJSON('listening-history', next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    safeSetJSON('listening-history', [])
  }, [])

  // Persist what's loaded and the queue so a reload picks up where you were.
  useEffect(() => {
    safeSetJSON('player-session', { current: slimEntry(current), queue: queue.map(slimEntry) })
  }, [current, queue])

  // ---- loading episodes ------------------------------------------------
  const rateFor = (podcastId) => safeGetJSON('podcast-speeds', {})[podcastId] || 1

  const load = useCallback((podcast, episode, { autoplay = true, startAt = null } = {}) => {
    const audio = audioRef.current
    // Save the outgoing episode's position — only if something was actually
    // loaded (on startup the restored session has no audio yet).
    if (currentRef.current && (audio?.src || castRef.current.isConnected)) savePosition(true)

    const entry = { podcast, episode }
    currentRef.current = entry
    setCurrent(entry)
    setAdRanges([])
    setTime({ currentTime: 0, duration: episodeLength(episode) || 0 })
    lastSaveRef.current = Date.now()
    wantPlayRef.current = autoplay
    clearTimeout(retryRef.current.timer)
    retryRef.current = { count: 0, timer: null }

    const r = rateFor(podcast.id)
    setRateState(r)

    // Local progress gives an instant resume point; the server copy (which
    // may come from another device) refines it once fetched.
    const local = progressRef.current[episode.id]
    const start = startAt ?? (local && !local.done ? local.p : 0)
    pendingSeekRef.current = start || null
    lastKnownRef.current = { t: start || 0, d: episodeLength(episode) }

    const c = castRef.current
    if (c.isConnected) {
      c.loadMedia(absoluteUrl(streamUrl(podcast.id, episode.id)), castMeta(podcast, episode), start, r)
    } else if (audio) {
      audio.src = streamUrl(podcast.id, episode.id)
      audio.defaultPlaybackRate = r
      audio.playbackRate = r
      if (autoplay) audio.play().catch(() => {})
    }

    if (startAt === null) getClientInfo(positionKey(podcast.id, episode.id)).then(t => {
      if (t === null || currentRef.current?.episode.id !== episode.id) return
      const serverPos = Number(t)
      const d = episodeLength(episode) || 0
      if (!isFinite(serverPos) || isFinished(serverPos, d)) return
      if (local && local.t && Math.abs(serverPos - local.p) < 3) return
      if (castRef.current.isConnected) { castRef.current.seek(serverPos); return }
      if (audio && audio.readyState >= 1) audio.currentTime = serverPos
      else pendingSeekRef.current = serverPos
      lastKnownRef.current = { t: serverPos, d: lastKnownRef.current.d }
    })

    if (autoplay) {
      recordStarted(podcast.id, episode.id)
      pushHistory(podcast, episode)
    }
  }, [savePosition, pushHistory])

  // Restore the last session's episode (paused) on first mount.
  useEffect(() => {
    if (session?.current?.podcast && session?.current?.episode) {
      load(session.current.podcast, session.current.episode, { autoplay: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch detected ad segments for the current episode.
  useEffect(() => {
    const id = current?.episode.id
    if (!id) return
    let cancelled = false
    fetch(`/ads/candidates?episode_id=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : { candidates: [] })
      .then(data => {
        if (cancelled) return
        const ranges = (data.candidates || []).map(c => (
          c.episode_a_id === id ? { start: c.start_a_sec, end: c.end_a_sec } : { start: c.start_b_sec, end: c.end_b_sec }
        ))
        setAdRanges(mergeRanges(ranges))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [current?.episode.id])

  // ---- transport -------------------------------------------------------
  const playNext = useCallback(() => {
    const [next, ...rest] = queueRef.current
    if (!next) return false
    setQueue(rest)
    load(next.podcast, next.episode)
    return true
  }, [load])

  const play = useCallback(() => {
    const c = castRef.current
    if (c.isConnected) { if (c.isPaused) c.playOrPause(); return }
    wantPlayRef.current = true
    audioRef.current?.play().catch(() => {})
    const cur = currentRef.current
    if (cur) { recordStarted(cur.podcast.id, cur.episode.id); pushHistory(cur.podcast, cur.episode) }
  }, [pushHistory])

  const pause = useCallback(() => {
    const c = castRef.current
    if (c.isConnected) { if (!c.isPaused) c.playOrPause(); return }
    wantPlayRef.current = false
    audioRef.current?.pause()
  }, [])

  const togglePlay = useCallback(() => {
    const c = castRef.current
    if (c.isConnected) { c.playOrPause(); return }
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) play()
    else { wantPlayRef.current = false; audio.pause() }
  }, [play])

  const seek = useCallback((seconds) => {
    const c = castRef.current
    if (c.isConnected) { c.seek(seconds); return }
    const audio = audioRef.current
    if (!audio) return
    const d = audio.duration || Infinity
    audio.currentTime = Math.max(0, Math.min(seconds, d - 0.5))
    setTime(t => ({ ...t, currentTime: audio.currentTime }))
  }, [])

  const skip = useCallback((delta) => {
    const c = castRef.current
    const t = c.isConnected ? c.currentTime : audioRef.current?.currentTime || 0
    seek(t + delta)
  }, [seek])

  // Plays an episode: toggles if it's already the loaded one.
  const playEpisode = useCallback((podcast, episode, { startAt = null } = {}) => {
    if (currentRef.current?.episode.id === episode.id) {
      if (startAt !== null) { seek(startAt); play() } else togglePlay()
      return
    }
    setQueue(q => q.filter(e => e.episode.id !== episode.id))
    load(podcast, episode, { startAt })
  }, [load, togglePlay, seek, play])

  const setRate = useCallback((r) => {
    setRateState(r)
    const audio = audioRef.current
    if (audio) { audio.playbackRate = r; audio.defaultPlaybackRate = r }
    const cur = currentRef.current
    if (cur) {
      // Speed is remembered per show, like Apple Podcasts.
      const speeds = safeGetJSON('podcast-speeds', {})
      if (r === 1) delete speeds[cur.podcast.id]
      else speeds[cur.podcast.id] = r
      safeSetJSON('podcast-speeds', speeds)
    }
  }, [])

  const setAdSkip = useCallback((enabled) => {
    setAdSkipState(enabled)
    safeSet('adSkipEnabled', enabled ? 'true' : 'false')
  }, [])

  // ---- sleep timer -----------------------------------------------------
  const setSleep = useCallback((value) => {
    if (value === null) { setSleepState(null); return }
    if (value === 'end') { setSleepState({ type: 'end' }); return }
    setSleepState({ type: 'time', endsAt: Date.now() + value * 60 * 1000 })
  }, [])

  useEffect(() => {
    if (sleep?.type !== 'time') return
    const ms = sleep.endsAt - Date.now()
    const id = setTimeout(() => {
      pause()
      setSleepState(null)
      toast('Sleep timer ended')
    }, Math.max(0, ms))
    return () => clearTimeout(id)
  }, [sleep, pause, toast])

  // ---- queue -----------------------------------------------------------
  const enqueue = useCallback((podcast, episode, { next = false } = {}) => {
    if (currentRef.current?.episode.id === episode.id) return
    setQueue(q => {
      const rest = q.filter(e => e.episode.id !== episode.id)
      const entry = { podcast, episode }
      return next ? [entry, ...rest] : [...rest, entry]
    })
    toast(next ? 'Playing next' : 'Added to Up Next')
  }, [toast])

  const removeFromQueue = useCallback((episodeId) => {
    setQueue(q => q.filter(e => e.episode.id !== episodeId))
  }, [])

  const moveInQueue = useCallback((from, to) => {
    setQueue(q => {
      if (to < 0 || to >= q.length || from === to) return q
      const n = [...q]
      const [item] = n.splice(from, 1)
      n.splice(to, 0, item)
      return n
    })
  }, [])

  const clearQueue = useCallback(() => setQueue([]), [])

  const playFromQueue = useCallback((episodeId) => {
    const entry = queueRef.current.find(e => e.episode.id === episodeId)
    if (!entry) return
    setQueue(q => q.filter(e => e.episode.id !== episodeId))
    load(entry.podcast, entry.episode)
  }, [load])

  const markPlayed = useCallback((podcast, episode, played = true) => {
    const d = episodeLength(episode) || 0
    const position = played ? d : 0
    setClientInfo(positionKey(podcast.id, episode.id), position)
    updateProgress(episode.id, podcast.id, position, d, played)
    if (played) recordStarted(podcast.id, episode.id)
    toast(played ? 'Marked as played' : 'Marked as unplayed')
  }, [updateProgress, toast])

  // ---- <audio> event wiring -------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      const t = audio.currentTime
      if (audio.src && pendingSeekRef.current === null) lastKnownRef.current = { t, d: audio.duration || 0 }
      setTime({ currentTime: t, duration: audio.duration || episodeLength(currentRef.current?.episode) || 0 })
      if (adSkipRef.current && !audio.paused) {
        const range = adRangesRef.current.find(r => t >= r.start && t < r.end - 0.5)
        if (range) {
          audio.currentTime = range.end
          toast(`Skipped ad · ${Math.round(range.end - range.start)}s`)
        }
      }
      if (!audio.paused) savePosition()
    }
    const onMeta = () => {
      if (pendingSeekRef.current) {
        audio.currentTime = pendingSeekRef.current
        pendingSeekRef.current = null
      }
      setTime({ currentTime: audio.currentTime, duration: audio.duration || 0 })
    }
    const onPlay = () => setPaused(false)
    const onPause = () => { setPaused(true); savePosition(true) }
    const onWaiting = () => setBuffering(true)
    const onPlaying = () => setBuffering(false)
    const onEnded = () => {
      const cur = currentRef.current
      if (cur) updateProgress(cur.episode.id, cur.podcast.id, audio.duration, audio.duration, true)
      if (sleepRef.current?.type === 'end') {
        setSleepState(null)
        toast('Sleep timer ended')
        return
      }
      playNext()
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('canplay', onPlaying)
    const onError = () => {
      if (!currentRef.current || !audio.src) return
      setBuffering(false)
      const retry = retryRef.current
      if (retry.count >= 12) {
        toast('Couldn’t load this episode')
        return
      }
      if (retry.count === 0) toast('Episode is still downloading — will start shortly')
      retry.count += 1
      clearTimeout(retry.timer)
      retry.timer = setTimeout(() => {
        const t = audio.currentTime
        audio.load()
        if (t) pendingSeekRef.current = t
        if (wantPlayRef.current) audio.play().catch(() => {})
      }, 5000)
    }

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('error', onError)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('canplay', onPlaying)
      audio.removeEventListener('ended', onEnded)
    }
  }, [savePosition, updateProgress, playNext, toast])

  // ---- Chromecast hand-off --------------------------------------------
  const wasConnected = useRef(false)
  useEffect(() => {
    const audio = audioRef.current
    const cur = currentRef.current
    if (cast.isConnected && !wasConnected.current) {
      wasConnected.current = true
      if (cur && audio) {
        const start = audio.currentTime || 0
        audio.pause()
        cast.loadMedia(absoluteUrl(streamUrl(cur.podcast.id, cur.episode.id)), castMeta(cur.podcast, cur.episode), start, rate)
      }
    } else if (!cast.isConnected && wasConnected.current) {
      wasConnected.current = false
      if (audio && cast.currentTime) audio.currentTime = cast.currentTime
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast.isConnected])

  // Cast ad-skip and position saving, mirroring the local audio handlers.
  useEffect(() => {
    if (!cast.isConnected || cast.isPaused) return
    const t = cast.currentTime
    if (adSkip) {
      const range = adRanges.find(r => t >= r.start && t < r.end - 0.5)
      if (range) { cast.seek(range.end); toast('Skipped ad') }
    }
    savePosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast.currentTime])

  // ---- Media Session (lock screen / hardware keys) ---------------------
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.episode.name,
      artist: current.podcast.name,
      album: current.podcast.name,
      artwork: [{ src: imageUrl(current.podcast.id), sizes: '512x512' }],
    })
  }, [current])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn) } catch { /* unsupported */ } }
    set('play', play)
    set('pause', pause)
    set('seekbackward', (d) => skip(-(d?.seekOffset || SKIP_BACK)))
    set('seekforward', (d) => skip(d?.seekOffset || SKIP_FORWARD))
    set('seekto', (d) => d?.seekTime != null && seek(d.seekTime))
    set('previoustrack', () => skip(-SKIP_BACK))
    set('nexttrack', () => { if (!playNext()) skip(SKIP_FORWARD) })
  }, [play, pause, skip, seek, playNext])

  // ---- keyboard shortcuts ---------------------------------------------
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!currentRef.current) return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowRight') skip(SKIP_FORWARD)
      else if (e.code === 'ArrowLeft') skip(-SKIP_BACK)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, skip])

  // Flush the position when the tab is hidden, closed or reloaded.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') savePosition(true) }
    const onHide = () => savePosition(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [savePosition])

  const isPlaying = cast.isConnected ? !cast.isPaused : !paused
  const timeValue = useMemo(() => (cast.isConnected
    ? { currentTime: cast.currentTime, duration: cast.duration || episodeLength(current?.episode) || 0 }
    : time), [cast.isConnected, cast.currentTime, cast.duration, time, current])

  const value = {
    current, queue, isPlaying, isBuffering: buffering && !paused, rate, adSkip, adRanges, sleep,
    nowPlayingOpen, setNowPlayingOpen, queueOpen, setQueueOpen,
    progress, history, toast: toastState, showToast: toast,
    cast: {
      isAvailable: cast.isAvailable, isConnected: cast.isConnected, deviceName: cast.deviceName,
      request: cast.requestSession, end: cast.endSession,
    },
    playEpisode, play, pause, togglePlay, seek, skip, setRate, setAdSkip, setSleep,
    enqueue, removeFromQueue, moveInQueue, clearQueue, playFromQueue, playNext, markPlayed, clearHistory,
  }

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={timeValue}>
        {children}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} preload="metadata" />
      </TimeContext.Provider>
    </PlayerContext.Provider>
  )
}

function absoluteUrl(path) {
  return `${window.location.protocol}//${window.location.host}${path}`
}

function castMeta(podcast, episode) {
  return { title: episode.name, artist: podcast.name, artwork: absoluteUrl(imageUrl(podcast.id)) }
}

export function usePlayer() {
  return useContext(PlayerContext)
}

export function usePlaybackTime() {
  return useContext(TimeContext)
}

// Returns {position, duration, done, started} for an episode, preferring
// live playback time (only passed for the loaded episode, so most rows never
// subscribe to the ticking TimeContext), then locally-cached progress, then
// server-fetched positions.
export function getEpisodeProgress(episode, { progress, serverPositions, live }) {
  const d = episodeLength(episode) || 0
  if (live && live.currentTime > 0) {
    return { position: live.currentTime, duration: live.duration || d, done: false, started: true }
  }
  const local = progress?.[episode.id]
  if (local) return { position: local.p, duration: local.d || d, done: !!local.done, started: local.p > 0 || !!local.done }
  const server = serverPositions?.[episode.id]
  if (server !== undefined && server !== null) {
    const p = Number(server) || 0
    return { position: p, duration: d, done: isFinished(p, d), started: true }
  }
  return { position: 0, duration: d, done: false, started: false }
}
