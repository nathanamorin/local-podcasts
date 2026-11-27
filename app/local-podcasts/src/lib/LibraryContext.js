import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const LibraryContext = createContext(null)
const PAGE_SIZE = 100

// Loads the full subscription list (walking every page of /podcasts) plus
// the user's favorites, shared by the sidebar, library and show pages so
// favorites and sorting are always computed over the whole library rather
// than just whichever page happened to be loaded.
export function LibraryProvider({ children }) {
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      let page = 1
      let all = []
      for (;;) {
        const res = await fetch(`/podcasts?page=${page}&page_size=${PAGE_SIZE}`)
        if (!res.ok) break
        const { podcasts: batch, pagination } = await res.json()
        all = all.concat(batch || [])
        setPodcasts(all)
        if (!pagination?.has_more) break
        page += 1
      }
    } catch {
      // leave whatever loaded
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetch('/me/favorites')
      .then(r => r.ok ? r.json() : { podcast_ids: [] })
      .then(d => setFavorites(d.podcast_ids || []))
      .catch(() => {})
  }, [load])

  const toggleFavorite = useCallback((podcastId) => {
    setFavorites(prev => {
      const on = prev.includes(podcastId)
      fetch(`/me/favorites/${encodeURIComponent(podcastId)}`, { method: on ? 'DELETE' : 'PUT' }).catch(() => {})
      return on ? prev.filter(id => id !== podcastId) : [...prev, podcastId]
    })
  }, [])

  // Asks the server to re-poll every feed, then reloads the list.
  const refreshFeeds = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch('/refresh')
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const value = useMemo(() => {
    const favoriteSet = new Set(favorites)
    return {
      podcasts,
      loading,
      refreshing,
      favorites: favoriteSet,
      favoritePodcasts: podcasts.filter(p => favoriteSet.has(p.id)),
      isFavorite: (id) => favoriteSet.has(id),
      toggleFavorite,
      refreshFeeds,
      reload: load,
      getPodcast: (id) => podcasts.find(p => p.id === id),
    }
  }, [podcasts, loading, refreshing, favorites, toggleFavorite, refreshFeeds, load])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  return useContext(LibraryContext)
}
