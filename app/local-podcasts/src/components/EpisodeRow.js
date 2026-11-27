import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlayer, getEpisodeProgress } from '../player/PlayerContext'
import { Artwork, Popover, MenuItem, usePopover } from './primitives'
import { PlayPill } from './Controls'
import { AddToQueueIcon, MoreIcon, PlayNextIcon, CheckCircleIcon, CircleIcon, NotesIcon, PodcastIcon, CheckIcon, StarIcon } from './Icons'
import { formatPublishDate, htmlToText } from '../lib/format'

export function episodePath(podcastId, episodeId) {
  return `/podcast/${podcastId}/episode/${episodeId}`
}

// Context menu shared by episode rows, the episode page and Up Next.
export function EpisodeMenu({ podcast, episode, anchor, onClose, serverPositions, showGoToShow = true }) {
  const { enqueue, markPlayed, progress, queue } = usePlayer()
  const navigate = useNavigate()
  const prog = getEpisodeProgress(episode, { progress, serverPositions })
  const queued = queue.some(q => q.episode.id === episode.id)
  const run = (fn) => () => { fn(); onClose() }
  return (
    <Popover anchor={anchor} onClose={onClose} title={episode.name}>
      <MenuItem icon={<PlayNextIcon size={18} />} onClick={run(() => enqueue(podcast, episode, { next: true }))}>Play Next</MenuItem>
      <MenuItem icon={queued ? <CheckIcon size={18} /> : <AddToQueueIcon size={18} />} onClick={run(() => enqueue(podcast, episode))}>
        {queued ? 'Move to End of Up Next' : 'Add to Up Next'}
      </MenuItem>
      <div className="menu-sep" />
      {prog.done
        ? <MenuItem icon={<CircleIcon size={18} />} onClick={run(() => markPlayed(podcast, episode, false))}>Mark as Unplayed</MenuItem>
        : <MenuItem icon={<CheckCircleIcon size={18} />} onClick={run(() => markPlayed(podcast, episode, true))}>Mark as Played</MenuItem>}
      <div className="menu-sep" />
      <MenuItem icon={<NotesIcon size={18} />} onClick={run(() => navigate(episodePath(podcast.id, episode.id), { state: { podcast, episode } }))}>
        Episode Details
      </MenuItem>
      {showGoToShow && (
        <MenuItem icon={<PodcastIcon size={18} />} onClick={run(() => navigate(`/podcast/${podcast.id}`))}>Go to Show</MenuItem>
      )}
    </Popover>
  )
}

// Episode row anatomy (Apple Podcasts style): date · duration eyebrow, 2-line
// title, 2-line description, then a play pill with live progress and
// queue / overflow actions.
function EpisodeRowImpl({ podcast, episode, showArt = false, serverPositions, descLines = 2, favorite = false }) {
  const { current, progress, enqueue } = usePlayer()
  const menu = usePopover()
  const isCurrent = current?.episode.id === episode.id
  const prog = getEpisodeProgress(episode, { progress, serverPositions })
  const to = episodePath(podcast.id, episode.id)
  const desc = htmlToText(episode.description).replace(/\s+/g, ' ')

  return (
    <li className={`episode ${showArt ? 'with-art' : ''} ${prog.done && !isCurrent ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}>
      {showArt && (
        <Link to={`/podcast/${podcast.id}`} tabIndex={-1} aria-hidden="true">
          <Artwork podcastId={podcast.id} className="round-xs" />
        </Link>
      )}
      <div className="ep-body">
        <div className="ep-meta">
          {favorite && <StarIcon size={11} filled className="fav-star" aria-label="Favorite" />}
          {showArt && <><span className="show-name">{podcast.name}</span><span className="dot-sep" /></>}
          <span style={{ flexShrink: 0 }}>{formatPublishDate(episode.publish_timestamp)}</span>
        </div>
        <Link to={to} state={{ podcast, episode }} className="ep-title clamp-2">{episode.name}</Link>
        {descLines > 0 && desc && <p className={`ep-desc clamp-${descLines}`}>{desc}</p>}
      </div>
      <div className="ep-actions">
        <PlayPill podcast={podcast} episode={episode} serverPositions={serverPositions} />
        <span className="spacer" />
        {!isCurrent && (
          <button type="button" className="icon-btn sm" onClick={() => enqueue(podcast, episode)} aria-label="Add to Up Next" title="Add to Up Next">
            <AddToQueueIcon size={18} />
          </button>
        )}
        <button type="button" className="icon-btn sm" onClick={menu.open} aria-label="More actions" aria-haspopup="menu" title="More">
          <MoreIcon size={18} />
        </button>
      </div>
      {menu.isOpen && (
        <EpisodeMenu podcast={podcast} episode={episode} anchor={menu.anchor} onClose={menu.close} serverPositions={serverPositions} showGoToShow={showArt} />
      )}
    </li>
  )
}

export const EpisodeRow = memo(EpisodeRowImpl)
