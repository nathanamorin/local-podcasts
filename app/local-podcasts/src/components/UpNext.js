import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayer } from '../player/PlayerContext'
import { Artwork } from './primitives'
import { CloseIcon, GripIcon, ArrowUpIcon, ArrowDownIcon, QueueIcon } from './Icons'
import { formatDuration, episodeLength } from '../lib/format'
import { episodePath } from './EpisodeRow'

function Equalizer({ playing }) {
  return <span className={`eq ${playing ? '' : 'paused'}`} aria-hidden="true"><i /><i /><i /></span>
}

// Up Next queue: now playing, then a drag-to-reorder list (with keyboard
// up/down fallbacks) and a running total of time remaining.
export function UpNext({ onClose, compactHeader = false }) {
  const { current, queue, isPlaying, playFromQueue, removeFromQueue, moveInQueue, clearQueue, setNowPlayingOpen } = usePlayer()
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)

  const total = queue.reduce((s, q) => s + episodeLength(q.episode), 0)

  function onDrop(e, idx) {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== idx) moveInQueue(dragIdx, idx)
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <>
      {!compactHeader && (
        <div className="upnext-head">
          <h2>Up Next</h2>
          {onClose && (
            <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close Up Next">
              <CloseIcon size={18} />
            </button>
          )}
        </div>
      )}
      <div className="upnext-body">
        {current && (
          <>
            <div className="upnext-label">Now Playing</div>
            <div className="q-item current">
              <Artwork podcastId={current.podcast.id} />
              <div className="q-text" onClick={() => setNowPlayingOpen(true)}>
                <div className="q-title clamp-2">{current.episode.name}</div>
                <div className="q-sub">{current.podcast.name}</div>
              </div>
              <span style={{ color: 'var(--accent)', paddingRight: 8 }}><Equalizer playing={isPlaying} /></span>
            </div>
          </>
        )}

        <div className="upnext-label">
          <span>Up Next{queue.length ? ` · ${queue.length}` : ''}</span>
          {total > 0 && <span>{formatDuration(total)}</span>}
          <span className="spacer" />
          {queue.length > 1 && (
            <button type="button" className="btn-ghost" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }} onClick={clearQueue}>
              Clear
            </button>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="empty" style={{ padding: '40px 16px' }}>
            <div className="empty-icon"><QueueIcon size={28} /></div>
            <h3>Your queue is empty</h3>
            <p>Use <strong>Add to Up Next</strong> on any episode, or <strong>Play Next</strong> from its menu, to line up what plays after this.</p>
          </div>
        ) : (
          queue.map(({ podcast, episode }, idx) => (
            <div
              key={episode.id}
              className={`q-item ${dragIdx === idx ? 'dragging' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? (dragIdx < idx ? 'drop-after' : 'drop-before') : ''}`}
              draggable
              onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx) }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              onDrop={(e) => onDrop(e, idx)}
            >
              <span className="q-handle" aria-hidden="true"><GripIcon size={16} /></span>
              <Artwork podcastId={podcast.id} />
              <div className="q-text" onClick={() => playFromQueue(episode.id)} title="Play now">
                <div className="q-title clamp-2">{episode.name}</div>
                <div className="q-sub">
                  <Link to={episodePath(podcast.id, episode.id)} state={{ podcast, episode }} onClick={e => { e.stopPropagation(); onClose?.() }} style={{ color: 'inherit' }}>
                    {podcast.name}
                  </Link>
                  {episodeLength(episode) ? ` · ${formatDuration(episodeLength(episode))}` : ''}
                </div>
              </div>
              <div className="q-actions">
                <button type="button" className="icon-btn" onClick={() => moveInQueue(idx, idx - 1)} disabled={idx === 0} aria-label="Move up"><ArrowUpIcon size={15} /></button>
                <button type="button" className="icon-btn" onClick={() => moveInQueue(idx, idx + 1)} disabled={idx === queue.length - 1} aria-label="Move down"><ArrowDownIcon size={15} /></button>
                <button type="button" className="icon-btn" onClick={() => removeFromQueue(episode.id)} aria-label="Remove from Up Next"><CloseIcon size={15} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
