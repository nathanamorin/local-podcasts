import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../lib/LibraryContext'
import { usePlayer } from '../player/PlayerContext'
import { Artwork, useIsMobile } from '../components/primitives'
import { PlayPill } from '../components/Controls'
import { TopBar } from '../components/TopBar'
import { EpisodeRow, episodePath } from '../components/EpisodeRow'
import { SearchIcon, CloseIcon, RefreshIcon, PlusIcon, StarIcon, PodcastIcon, PlayIcon, PauseIcon } from '../components/Icons'
import { formatPublishDate, formatRemaining } from '../lib/format'
import { safeGet, safeSet } from '../lib/storage'

const DAY = 86400

const relativeLower = (d) => (d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : d)

function ContinueCard({ entry, prog }) {
  const { playEpisode, current, isPlaying } = usePlayer()
  const { podcast, episode } = entry
  const isCurrentPlaying = current?.episode.id === episode.id && isPlaying
  const pct = prog.d > 0 ? Math.min(100, (prog.p / prog.d) * 100) : 0
  return (
    <div className="continue-card">
      <Link to={episodePath(podcast.id, episode.id)} state={{ podcast, episode }} style={{ display: 'contents' }}>
        <Artwork podcastId={podcast.id} />
        <div className="meta">
          <div className="show clamp-1">{podcast.name}</div>
          <div className="title clamp-2">{episode.name}</div>
          <div className="progress-line">
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="nums">{formatRemaining(prog.d - prog.p)}</span>
          </div>
        </div>
      </Link>
      <button type="button" className="play-btn md" onClick={() => playEpisode(podcast, episode)} aria-label={isCurrentPlaying ? 'Pause' : `Resume ${episode.name}`}>
        {isCurrentPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} style={{ marginLeft: 2 }} />}
      </button>
    </div>
  )
}

// Phone layout for Latest Episodes: compact swipeable cards instead of
// full-height rows, so the Shows grid is reachable on the first screen.
function LatestCard({ podcast, favorite }) {
  const episode = podcast.latest_episode
  return (
    <div className="continue-card latest-card">
      <Link to={`/podcast/${podcast.id}`} tabIndex={-1} aria-hidden="true">
        <Artwork podcastId={podcast.id} />
      </Link>
      <div className="meta">
        <div className="show clamp-1">
          {favorite && <StarIcon size={11} filled className="fav-star" aria-label="Favorite" />}
          {podcast.name} · {formatPublishDate(episode.publish_timestamp)}
        </div>
        <Link to={episodePath(podcast.id, episode.id)} state={{ podcast, episode }} className="title clamp-2">{episode.name}</Link>
        <div style={{ marginTop: 4 }}><PlayPill podcast={podcast} episode={episode} /></div>
      </div>
    </div>
  )
}

function ShowTile({ podcast }) {
  const { isFavorite, toggleFavorite } = useLibrary()
  const { progress } = usePlayer()
  const fav = isFavorite(podcast.id)
  const latest = podcast.latest_episode
  // Unplayed-and-recent marker (a dot, not a badge: most active shows
  // publish daily, so a loud badge on every tile carried no signal).
  const isNew = latest && !progress[latest.id] && Date.now() / 1000 - latest.publish_timestamp < 3 * DAY
  return (
    <Link to={`/podcast/${podcast.id}`} className="show-tile">
      <Artwork podcastId={podcast.id} className="round-lg" alt="" />
      {isNew && <span className="new-dot" title="New episode" aria-label="New episode" />}
      <button
        type="button"
        className={`fav ${fav ? 'on' : ''}`}
        onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(podcast.id) }}
        aria-label={fav ? `Remove ${podcast.name} from favorites` : `Add ${podcast.name} to favorites`}
        aria-pressed={fav}
      >
        <StarIcon size={16} filled={fav} />
      </button>
      <div>
        <div className="name clamp-2">{podcast.name}</div>
        {latest && <div className="sub">Updated {relativeLower(formatPublishDate(latest.publish_timestamp))}</div>}
      </div>
    </Link>
  )
}

function SkeletonGrid() {
  return (
    <div className="show-grid">
      {[...Array(10)].map((_, i) => (
        <div key={i}>
          <div className="skeleton" style={{ aspectRatio: '1/1', borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 10 }} />
        </div>
      ))}
    </div>
  )
}

export function Library() {
  const { podcasts, loading, refreshing, refreshFeeds, favorites } = useLibrary()
  const { history, progress } = usePlayer()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(() => safeGet('library-filter') || 'all')
  const [sort, setSort] = useState(() => safeGet('library-sort') || 'recent')

  const setFilterP = (f) => { setFilter(f); safeSet('library-filter', f) }
  const setSortP = (s) => { setSort(s); safeSet('library-sort', s) }

  const continueListening = useMemo(() => history
    .map(h => ({ entry: h, prog: progress[h.episode.id] }))
    .filter(x => x.prog && !x.prog.done && x.prog.p > 15)
    .slice(0, 10), [history, progress])

  // Favorites' newest episodes float to the top (newest first), followed by
  // everything else by recency.
  const latest = useMemo(() => podcasts
    .filter(p => p.latest_episode)
    .sort((a, b) => {
      const fa = favorites.has(a.id), fb = favorites.has(b.id)
      if (fa !== fb) return fa ? -1 : 1
      return b.latest_episode.publish_timestamp - a.latest_episode.publish_timestamp
    })
    .slice(0, 8), [podcasts, favorites])

  const shows = useMemo(() => {
    let list = podcasts
    if (filter === 'favorites') list = list.filter(p => favorites.has(p.id))
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.latest_episode?.name || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else sorted.sort((a, b) => (b.latest_episode?.publish_timestamp || 0) - (a.latest_episode?.publish_timestamp || 0))
    return sorted
  }, [podcasts, filter, sort, query, favorites])

  const searching = query.length > 0
  const isMobile = useIsMobile()

  return (
    <>
      <TopBar title="Library" />
      <div className="page">
        <div className="library-head" style={{ paddingTop: 0 }}>
          <h1 className="large-title">Library</h1>
          <button type="button" className="icon-btn filled" onClick={refreshFeeds} disabled={refreshing} aria-label="Refresh all feeds" title="Check for new episodes">
            <RefreshIcon size={18} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
          <Link to="/podcast/add" className="btn btn-primary" style={{ height: 38 }}>
            <PlusIcon size={18} /> <span>Add Show</span>
          </Link>
        </div>

        <div className="library-tools">
          <label className="search">
            <SearchIcon size={17} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your shows" aria-label="Search your shows" />
            {query && <button type="button" className="clear" onClick={() => setQuery('')} aria-label="Clear search"><CloseIcon size={11} strokeWidth={3} /></button>}
          </label>
        </div>

        {!searching && continueListening.length > 0 && (
          <section className="section">
            <div className="section-head"><h2 className="section-title">Continue Listening</h2></div>
            <div className="shelf">
              {continueListening.map(({ entry, prog }) => <ContinueCard key={entry.episode.id} entry={entry} prog={prog} />)}
            </div>
          </section>
        )}

        {!searching && latest.length > 0 && (
          <section className="section">
            <div className="section-head"><h2 className="section-title">Latest Episodes</h2></div>
            {isMobile ? (
              <div className="shelf">
                {latest.map(p => <LatestCard key={p.latest_episode.id} podcast={p} favorite={favorites.has(p.id)} />)}
              </div>
            ) : (
              <ul className="episode-list latest-grid">
                {latest.map(p => (
                  <EpisodeRow key={p.latest_episode.id} podcast={p} episode={p.latest_episode} showArt descLines={1} favorite={favorites.has(p.id)} />
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="section">
          <div className="section-head" style={{ flexWrap: 'wrap', rowGap: 12 }}>
            <h2 className="section-title">{searching ? 'Results' : 'Shows'}</h2>
            <span className="spacer" />
            <div className="chips" role="group" aria-label="Filter shows">
              <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilterP('all')}>All</button>
              <button type="button" className={`chip ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilterP('favorites')}>
                <StarIcon size={13} filled={filter === 'favorites'} /> Favorites
              </button>
            </div>
            <div className="segmented" role="group" aria-label="Sort shows">
              <button type="button" className={sort === 'recent' ? 'active' : ''} onClick={() => setSortP('recent')}>Recent</button>
              <button type="button" className={sort === 'az' ? 'active' : ''} onClick={() => setSortP('az')}>A–Z</button>
            </div>
          </div>

          {loading && podcasts.length === 0 ? <SkeletonGrid /> : shows.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">{filter === 'favorites' && !searching ? <StarIcon size={28} /> : <PodcastIcon size={28} />}</div>
              {searching ? (
                <><h3>No matches</h3><p>Nothing in your library matches “{query}”.</p></>
              ) : filter === 'favorites' ? (
                <><h3>No favorites yet</h3><p>Star a show to pin it here and in the sidebar.</p></>
              ) : (
                <>
                  <h3>Your library is empty</h3>
                  <p>Subscribe to a show with its RSS feed and new episodes will download automatically.</p>
                  <Link to="/podcast/add" className="btn btn-primary" style={{ marginTop: 8 }}><PlusIcon size={18} /> Add a Show</Link>
                </>
              )}
            </div>
          ) : (
            <div className="show-grid">
              {shows.map(p => <ShowTile key={p.id} podcast={p} />)}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
