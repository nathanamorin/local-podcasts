import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer, usePlaybackTime } from '../player/PlayerContext'
import { formatClock } from '../lib/format'
import { SearchIcon, CloseIcon, ArrowDownIcon, TranscriptIcon } from './Icons'

// Fetches an episode transcript. undefined = loading, null = unavailable.
export function useTranscript(podcastId, episodeId) {
  const [transcript, setTranscript] = useState(undefined)
  useEffect(() => {
    if (!podcastId || !episodeId) return
    setTranscript(undefined)
    let cancelled = false
    fetch(`/podcasts/${podcastId}/episodes/${episodeId}/transcript`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setTranscript(d?.segments?.length ? d : null) })
      .catch(() => { if (!cancelled) setTranscript(null) })
    return () => { cancelled = true }
  }, [podcastId, episodeId])
  return transcript
}

function highlight(text, q) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

// Synced transcript: highlights and follows the spoken line while this
// episode is playing, every line is tap-to-seek (or tap-to-start), and
// it's searchable. Following pauses when you scroll and resumes via the
// "Follow along" button.
export function Transcript({ podcast, episode, transcript }) {
  const { current, playEpisode, seek } = usePlayer()
  const isCurrent = current?.episode.id === episode.id
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const bodyRef = useRef(null)
  const programmatic = useRef(false)

  const segments = useMemo(() => {
    const segs = transcript?.segments || []
    if (!query) return segs
    const q = query.toLowerCase()
    return segs.filter(s => s.text.toLowerCase().includes(q))
  }, [transcript, query])

  if (transcript === undefined) {
    return <div className="transcript-body" style={{ padding: 16 }}>{[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 16, margin: '12px 0', width: `${70 + (i % 3) * 10}%` }} />)}</div>
  }
  if (!transcript) {
    return (
      <div className="empty" style={{ padding: '40px 20px' }}>
        <div className="empty-icon"><TranscriptIcon size={26} /></div>
        <h3>No transcript yet</h3>
        <p>Transcripts are generated in the background after an episode downloads. Check back soon.</p>
      </div>
    )
  }

  function onSegment(seg) {
    const t = seg.start_ms / 1000
    if (isCurrent) seek(t)
    else playEpisode(podcast, episode, { startAt: t })
    setFollow(true)
  }

  function onUserScroll() {
    if (programmatic.current) return
    if (isCurrent && follow) setFollow(false)
  }

  return (
    <div className="transcript" style={{ position: 'relative' }}>
      <div className="transcript-tools">
        <label className="search">
          <SearchIcon size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search transcript" aria-label="Search transcript" />
          {query && <button type="button" className="clear" onClick={() => setQuery('')} aria-label="Clear search"><CloseIcon size={11} strokeWidth={3} /></button>}
        </label>
      </div>
      <div className="transcript-body" ref={bodyRef} onWheel={onUserScroll} onTouchMove={onUserScroll}>
        {segments.length === 0 && <p style={{ color: 'var(--text-3)', padding: 12 }}>No matches.</p>}
        {isCurrent
          ? <LiveSegments segments={segments} query={query} onSegment={onSegment} follow={follow && !query} bodyRef={bodyRef} programmatic={programmatic} />
          : segments.map(seg => <Segment key={seg.index} seg={seg} query={query} onClick={onSegment} />)}
      </div>
      {isCurrent && !follow && !query && (
        <button type="button" className="btn btn-secondary follow-btn glass" style={{ height: 34, fontSize: 13 }} onClick={() => setFollow(true)}>
          <ArrowDownIcon size={15} /> Follow along
        </button>
      )}
    </div>
  )
}

function Segment({ seg, query, onClick, state = '' }) {
  return (
    <button type="button" className={`seg ${state}`} onClick={() => onClick(seg)} data-idx={seg.index}>
      <time>{formatClock(seg.start_ms / 1000)}</time>
      <span>{highlight(seg.text, query)}</span>
    </button>
  )
}

function LiveSegments({ segments, query, onSegment, follow, bodyRef, programmatic }) {
  const { currentTime } = usePlaybackTime()
  const ms = currentTime * 1000
  let activeIdx = -1
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start_ms <= ms) activeIdx = i
    else break
  }
  const activeKey = activeIdx >= 0 ? segments[activeIdx].index : null

  useEffect(() => {
    if (!follow || activeKey === null || !bodyRef.current) return
    const el = bodyRef.current.querySelector(`[data-idx="${activeKey}"]`)
    if (!el) return
    const body = bodyRef.current
    const target = el.offsetTop - body.clientHeight * 0.32
    programmatic.current = true
    body.scrollTo({ top: target, behavior: 'smooth' })
    const id = setTimeout(() => { programmatic.current = false }, 600)
    return () => clearTimeout(id)
  }, [activeKey, follow, bodyRef, programmatic])

  return segments.map((seg, i) => (
    <Segment key={seg.index} seg={seg} query={query} onClick={onSegment} state={i === activeIdx ? 'active' : i < activeIdx ? 'past' : ''} />
  ))
}
