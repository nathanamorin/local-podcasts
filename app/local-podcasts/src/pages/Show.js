import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLibrary } from '../lib/LibraryContext'
import { usePlayer, getEpisodeProgress } from '../player/PlayerContext'
import { useArtworkColor } from '../lib/useArtworkColor'
import { getClientInfo, positionKey, startedKey, deleteClientInfo } from '../lib/storage'
import { htmlToText, imageUrl, formatPublishDate } from '../lib/format'
import { Artwork, Spinner } from '../components/primitives'
import { TopBar } from '../components/TopBar'
import { EpisodeRow } from '../components/EpisodeRow'
import { PlayPill } from '../components/Controls'
import { StarIcon, SearchIcon, CloseIcon, CheckCircleIcon } from '../components/Icons'

const PAGE_SIZE = 50

// Loads server-side playback positions for every episode this client has
// started in the given show (the per-show "started" list + per-episode
// position keys written by the player).
function useServerPositions(podcastId) {
  const [positions, setPositions] = useState({})
  useEffect(() => {
    let cancelled = false
    setPositions({})
    ;(async () => {
      const raw = await getClientInfo(startedKey(podcastId))
      if (!raw) return
      let started
      try { started = JSON.parse(raw) || {} } catch { deleteClientInfo(startedKey(podcastId)); return }
      const ids = Object.keys(started)
      const out = {}
      for (let i = 0; i < ids.length; i += 8) {
        const batch = ids.slice(i, i + 8)
        const vals = await Promise.all(batch.map(id => started[id] !== null ? started[id] : getClientInfo(positionKey(podcastId, id))))
        batch.forEach((id, j) => { out[id] = vals[j] === null ? 0 : vals[j] })
        if (cancelled) return
        setPositions({ ...out })
      }
    })()
    return () => { cancelled = true }
  }, [podcastId])
  return positions
}

export function Show() {
  const { podcastId } = useParams()
  const { getPodcast, isFavorite, toggleFavorite } = useLibrary()
  const { progress } = usePlayer()
  const [podcast, setPodcast] = useState(() => getPodcast(podcastId) || null)
  const [episodes, setEpisodes] = useState([])
  const [total, setTotal] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [descOpen, setDescOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hidePlayed, setHidePlayed] = useState(false)
  const tint = useArtworkColor(imageUrl(podcastId))
  const serverPositions = useServerPositions(podcastId)

  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const nextPageRef = useRef(1)
  const sentinelRef = useRef(null)

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    const page = nextPageRef.current
    fetch(`/podcasts/${podcastId}/episodes?page=${page}&page_size=${PAGE_SIZE}`)
      .then(r => r.json())
      .then(({ episodes: batch, pagination }) => {
        setEpisodes(prev => (page === 1 ? batch : [...prev, ...batch]))
        setTotal(pagination.total)
        hasMoreRef.current = pagination.has_more
        nextPageRef.current = page + 1
      })
      .catch(() => {})
      .finally(() => { loadingRef.current = false; setLoadingMore(false) })
  }, [podcastId])

  useEffect(() => {
    setEpisodes([])
    setTotal(null)
    hasMoreRef.current = true
    nextPageRef.current = 1
    setPodcast(getPodcast(podcastId) || null)
    fetch(`/podcasts/${podcastId}`).then(r => r.json()).then(setPodcast).catch(() => {})
    loadMore()
    document.querySelector('.main')?.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcastId])

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { root: document.querySelector('.main'), rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore, episodes.length])

  const visible = useMemo(() => {
    let list = episodes
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q))
    }
    if (hidePlayed) list = list.filter(e => !getEpisodeProgress(e, { progress, serverPositions }).done)
    return list
  }, [episodes, query, hidePlayed, progress, serverPositions])

  // "Play" target: the newest episode you haven't finished.
  const featured = useMemo(
    () => episodes.find(e => !getEpisodeProgress(e, { progress, serverPositions }).done) || episodes[0],
    [episodes, progress, serverPositions]
  )

  const fav = isFavorite(podcastId)
  const desc = htmlToText(podcast?.description)
  const latestTs = episodes[0]?.publish_timestamp || podcast?.latest_episode?.publish_timestamp

  return (
    <>
      <TopBar title={podcast?.name} back="/" />
      <div className="hero" style={tint ? { '--tint': tint } : undefined}>
        <div className="hero-inner">
          <Artwork podcastId={podcastId} className="round-lg shadow" alt={podcast?.name || ''} />
          <div className="hero-meta">
            <h1 className="hero-title">{podcast?.name || <span className="skeleton" style={{ display: 'inline-block', width: 280, height: 36 }} />}</h1>
            <div className="hero-sub">
              {total !== null && `${total} episode${total === 1 ? '' : 's'}`}
              {latestTs ? ` · Updated ${formatPublishDate(latestTs)}` : ''}
            </div>
            {desc && (
              <div>
                <p className={`hero-desc ${descOpen ? '' : 'clamp-3'}`}>{desc}</p>
                {desc.length > 220 && (
                  <button type="button" className="more-link" onClick={() => setDescOpen(o => !o)}>{descOpen ? 'Less' : 'More'}</button>
                )}
              </div>
            )}
            <div className="hero-actions">
              {podcast && featured && <PlayPill podcast={podcast} episode={featured} serverPositions={serverPositions} large />}
              <button
                type="button"
                className={`icon-btn filled ${fav ? 'on' : ''}`}
                style={{ width: 44, height: 44 }}
                onClick={() => toggleFavorite(podcastId)}
                aria-pressed={fav}
                aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                title={fav ? 'Favorited' : 'Favorite'}
              >
                <StarIcon size={20} filled={fav} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="page">
        <div className="list-toolbar">
          <h2 className="section-title" style={{ marginRight: 'auto' }}>Episodes</h2>
          <label className="search">
            <SearchIcon size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search episodes" aria-label="Search episodes" />
            {query && <button type="button" className="clear" onClick={() => setQuery('')} aria-label="Clear search"><CloseIcon size={11} strokeWidth={3} /></button>}
          </label>
          <button type="button" className={`chip ${hidePlayed ? 'active' : ''}`} onClick={() => setHidePlayed(h => !h)} aria-pressed={hidePlayed}>
            <CheckCircleIcon size={15} /> Hide played
          </button>
        </div>

        {podcast && (
          <ul className="episode-list">
            {visible.map(ep => (
              <EpisodeRow key={ep.id} podcast={podcast} episode={ep} serverPositions={serverPositions} />
            ))}
          </ul>
        )}

        {episodes.length === 0 && loadingMore && (
          <div>{[...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: '16px 0', borderBottom: '1px solid var(--separator)' }}>
              <div className="skeleton" style={{ height: 11, width: 90 }} />
              <div className="skeleton" style={{ height: 17, width: '70%', marginTop: 10 }} />
              <div className="skeleton" style={{ height: 13, width: '95%', marginTop: 10 }} />
              <div className="skeleton" style={{ height: 28, width: 90, marginTop: 12, borderRadius: 999 }} />
            </div>
          ))}</div>
        )}

        {query && visible.length === 0 && !loadingMore && (
          <div className="empty"><h3>No matching episodes</h3><p>Only loaded episodes are searched — scroll to load older ones.</p></div>
        )}

        <div ref={sentinelRef} className="load-more">{loadingMore && episodes.length > 0 && <Spinner />}</div>
      </div>
    </>
  )
}
