import { useRef, useState } from 'react'
import { formatClock } from '../lib/format'
import { usePlaybackTime, usePlayer } from '../player/PlayerContext'

// Seek bar with drag-to-scrub, hover time preview, keyboard control and
// detected-ad segment markers drawn inline on the track.
export function Scrubber({ showTimes = false, className = '' }) {
  const { currentTime, duration } = usePlaybackTime()
  const { seek, adRanges, adSkip } = usePlayer()
  const ref = useRef(null)
  const [drag, setDrag] = useState(null) // seconds while dragging
  const [hover, setHover] = useState(null) // { x, t }

  const d = duration || 0
  const shown = drag ?? currentTime
  const pct = d > 0 ? Math.min(100, (shown / d) * 100) : 0

  function timeAt(clientX) {
    const r = ref.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return { t: ratio * d, x: ratio * r.width }
  }

  function onPointerDown(e) {
    if (!d) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(timeAt(e.clientX).t)
  }
  function onPointerMove(e) {
    if (!d) return
    const at = timeAt(e.clientX)
    setHover(at)
    if (drag !== null) setDrag(at.t)
  }
  function onPointerUp(e) {
    if (drag === null) return
    seek(timeAt(e.clientX).t)
    setDrag(null)
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      seek(currentTime + (e.key === 'ArrowRight' ? 10 : -10))
    }
  }

  return (
    <div className={className}>
      <div
        ref={ref}
        className={`scrubber ${drag !== null ? 'dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatClock(shown)} of ${formatClock(d)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        <div className="track">
          {d > 0 && adRanges.map((r, i) => (
            <div
              key={i}
              className="ad"
              title={adSkip ? 'Ad — will be skipped' : 'Detected ad'}
              style={{
                left: `${(Math.min(r.start, d) / d) * 100}%`,
                width: `${Math.max(0.4, ((Math.min(r.end, d) - Math.min(r.start, d)) / d) * 100)}%`,
              }}
            />
          ))}
          <div className="played" style={{ width: `${pct}%` }} />
          <div className="thumb" style={{ left: `${pct}%` }} />
        </div>
        {(drag !== null || hover) && d > 0 && (
          <div className="tooltip" style={{ left: drag !== null ? `${pct}%` : hover.x }}>
            {formatClock(drag ?? hover.t)}
          </div>
        )}
      </div>
      {showTimes && (
        <div className="times">
          <span>{formatClock(shown)}</span>
          <span>{d > 0 ? `-${formatClock(Math.max(0, d - shown))}` : '--:--'}</span>
        </div>
      )}
    </div>
  )
}
