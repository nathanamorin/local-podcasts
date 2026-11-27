import { createContext, useContext, useState, useCallback } from 'react'

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [currentPodcast, setCurrentPodcast] = useState(null)
  const [currentEpisode, setCurrentEpisode] = useState(null)
  const [queue, setQueue] = useState([]) // [{ podcast, episode }]
  const [showQueue, setShowQueue] = useState(false)
  const [seekHandler, setSeekHandler] = useState(null)

  const playNow = useCallback((podcast, episode) => {
    setCurrentPodcast(podcast)
    setCurrentEpisode(episode)
  }, [])

  const addToQueue = useCallback((podcast, episode) => {
    setQueue(q => [...q, { podcast, episode }])
  }, [])

  const removeFromQueue = useCallback((idx) => {
    setQueue(q => q.filter((_, i) => i !== idx))
  }, [])

  const moveUp = useCallback((idx) => {
    if (idx === 0) return
    setQueue(q => {
      const n = [...q]
      ;[n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]
      return n
    })
  }, [])

  const moveDown = useCallback((idx) => {
    setQueue(q => {
      if (idx >= q.length - 1) return q
      const n = [...q]
      ;[n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]
      return n
    })
  }, [])

  // Advances to the next episode in queue (called when current episode ends)
  const playNext = useCallback(() => {
    setQueue(q => {
      if (q.length === 0) return q
      const [next, ...rest] = q
      setCurrentPodcast(next.podcast)
      setCurrentEpisode(next.episode)
      return rest
    })
  }, [])

  // Lets PlayerBar (which owns the actual <audio> element) expose a way
  // for other pages (e.g. the transcript view) to jump playback to a
  // specific time, without those pages needing direct access to the
  // player's internal ref. Wrapped in a setter fn since React's useState
  // would otherwise try to call a raw function value as an updater.
  const registerSeekHandler = useCallback((fn) => {
    setSeekHandler(() => fn)
  }, [])

  const seekTo = useCallback((seconds) => {
    seekHandler?.(seconds)
  }, [seekHandler])

  return (
    <PlayerContext.Provider value={{
      currentPodcast,
      currentEpisode,
      queue,
      showQueue,
      setShowQueue,
      playNow,
      addToQueue,
      removeFromQueue,
      moveUp,
      moveDown,
      playNext,
      registerSeekHandler,
      seekTo,
      canSeek: !!seekHandler,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}
