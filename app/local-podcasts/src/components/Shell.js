import { Link, NavLink, useLocation } from 'react-router-dom'
import { usePlayer, usePlaybackTime, SKIP_FORWARD } from '../player/PlayerContext'
import { useLibrary } from '../lib/LibraryContext'
import { Artwork } from './primitives'
import { Scrubber } from './Scrubber'
import { PlayPauseButton, SkipButtons, SpeedControl, SleepControl, AdSkipToggle, CastButton } from './Controls'
import { UpNext } from './UpNext'
import {
  LibraryIcon, QueueIcon, PlusCircleIcon, UserIcon, PodcastIcon, PlayIcon, PauseIcon, SkipForwardIcon, ExpandIcon,
} from './Icons'
import { formatClock, formatRemaining } from '../lib/format'
import { episodePath } from './EpisodeRow'

export function Sidebar() {
  const { queue, queueOpen, setQueueOpen } = usePlayer()
  const { favoritePodcasts } = useLibrary()
  const location = useLocation()

  return (
    <nav className="sidebar" aria-label="Primary">
      <Link to="/" className="brand">
        <span className="brand-mark"><PodcastIcon size={18} strokeWidth={2.2} /></span>
        Podcasts
      </Link>
      <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <LibraryIcon size={19} /> Library
      </NavLink>
      <button type="button" className={`nav-item ${queueOpen ? 'active' : ''}`} onClick={() => setQueueOpen(o => !o)} aria-pressed={queueOpen}>
        <QueueIcon size={19} /> Up Next
        {queue.length > 0 && <span className="badge">{queue.length}</span>}
      </button>
      <NavLink to="/podcast/add" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <PlusCircleIcon size={19} /> Add Show
      </NavLink>
      <NavLink to="/user-info" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <UserIcon size={19} /> Account
      </NavLink>

      {favoritePodcasts.length > 0 && (
        <>
          <div className="sidebar-section">Favorites</div>
          {favoritePodcasts.map(p => (
            <Link
              key={p.id}
              to={`/podcast/${p.id}`}
              className={`sidebar-show ${location.pathname.startsWith(`/podcast/${p.id}`) ? 'active' : ''}`}
            >
              <Artwork podcastId={p.id} size={28} className="round-xs" />
              <span>{p.name}</span>
            </Link>
          ))}
        </>
      )}
    </nav>
  )
}

export function QueuePanel() {
  const { queueOpen, setQueueOpen } = usePlayer()
  return (
    <aside className="queue-panel" aria-label="Up Next" aria-hidden={!queueOpen}>
      {queueOpen && (
        <div className="queue-panel-inner">
          <UpNext onClose={() => setQueueOpen(false)} />
        </div>
      )}
    </aside>
  )
}

function ScrubRow() {
  const { currentTime, duration } = usePlaybackTime()
  return (
    <div className="pb-scrub-row">
      <span>{formatClock(currentTime)}</span>
      <Scrubber className="grow" />
      <span>{duration > 0 ? `-${formatClock(Math.max(0, duration - currentTime))}` : '--:--'}</span>
    </div>
  )
}

// Desktop persistent player bar: now-playing on the left, transport and
// scrubber centered, playback options on the right.
export function PlayerBar() {
  const { current, queue, queueOpen, setQueueOpen, setNowPlayingOpen, cast } = usePlayer()
  if (!current) {
    return <div className="playerbar empty-state">Pick an episode to start listening</div>
  }
  const { podcast, episode } = current
  return (
    <div className="playerbar" role="region" aria-label="Player">
      <div className="pb-now">
        <Artwork podcastId={podcast.id} className="round-xs" onClick={() => setNowPlayingOpen(true)} role="button" aria-label="Open Now Playing" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setNowPlayingOpen(true)}>
          <span className="expand"><ExpandIcon size={22} /></span>
        </Artwork>
        <div className="pb-text">
          <Link to={episodePath(podcast.id, episode.id)} state={{ podcast, episode }} className="pb-title" title={episode.name}>{episode.name}</Link>
          {cast.isConnected
            ? <span className="cast-banner">Casting to {cast.deviceName || 'device'}</span>
            : <Link to={`/podcast/${podcast.id}`} className="pb-show">{podcast.name}</Link>}
        </div>
      </div>

      <div className="pb-center">
        <div className="pb-transport">
          <SpeedControl placement="top" />
          <SkipButtons>
            <PlayPauseButton />
          </SkipButtons>
          <SleepControl placement="top" />
        </div>
        <ScrubRow />
      </div>

      <div className="pb-right">
        <AdSkipToggle />
        <CastButton />
        <button
          type="button"
          className={`icon-btn ${queueOpen ? 'on' : ''}`}
          onClick={() => setQueueOpen(o => !o)}
          aria-label="Up Next"
          title="Up Next"
        >
          <QueueIcon size={20} />
          {queue.length > 0 && !queueOpen && (
            <span className="badge" style={{ position: 'absolute', top: 0, right: -2, height: 16, minWidth: 16, fontSize: 10, padding: '0 4px' }}>{queue.length}</span>
          )}
        </button>
        <button type="button" className="icon-btn" onClick={() => setNowPlayingOpen(true)} aria-label="Open Now Playing" title="Now Playing">
          <ExpandIcon size={20} />
        </button>
      </div>
    </div>
  )
}

function MiniProgress() {
  const { currentTime, duration } = usePlaybackTime()
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  return <div className="mini-progress"><i style={{ width: `${pct}%` }} /></div>
}

function MiniRemaining({ fallback }) {
  const { currentTime, duration } = usePlaybackTime()
  const rem = formatRemaining(Math.max(0, duration - currentTime))
  return <>{rem || fallback}</>
}

// Mobile: a floating glass mini player docked above a floating glass tab
// bar (Liquid Glass-era Apple Podcasts / Pocket Casts pattern).
export function MobileDock() {
  const { current, queue, isPlaying, togglePlay, skip, setNowPlayingOpen } = usePlayer()
  return (
    <div className="mobile-dock">
      {current && (
        <div className="mini glass">
          <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, height: '100%' }}
            onClick={() => setNowPlayingOpen(true)} aria-label="Open Now Playing">
            <Artwork podcastId={current.podcast.id} />
            <span className="mini-text">
              <span className="mini-title">{current.episode.name}</span>
              <span className="mini-sub"><MiniRemaining fallback={current.podcast.name} /> · {current.podcast.name}</span>
            </span>
          </button>
          <button type="button" className="icon-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => skip(SKIP_FORWARD)} aria-label={`Forward ${SKIP_FORWARD} seconds`}>
            <SkipForwardIcon size={26} seconds={SKIP_FORWARD} />
          </button>
          <MiniProgress />
        </div>
      )}
      <nav className="tabbar glass" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <LibraryIcon size={22} /> Library
        </NavLink>
        <NavLink to="/up-next" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <QueueIcon size={22} /> Up Next
          {queue.length > 0 && <span className="badge">{queue.length}</span>}
        </NavLink>
        <NavLink to="/podcast/add" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <PlusCircleIcon size={22} /> Add
        </NavLink>
        <NavLink to="/user-info" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <UserIcon size={22} /> Account
        </NavLink>
      </nav>
    </div>
  )
}

export function Toast() {
  const { toast } = usePlayer()
  if (!toast) return null
  return <div className="toast" key={toast.id} role="status" aria-live="polite">{toast.message}</div>
}
