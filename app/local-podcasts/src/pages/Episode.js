import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { usePlayer } from '../player/PlayerContext'
import { useArtworkColor } from '../lib/useArtworkColor'
import { imageUrl, sanitizeHtml, formatPublishDate, formatDuration, episodeLength } from '../lib/format'
import { Artwork, usePopover, useIsMobile } from '../components/primitives'
import { TopBar } from '../components/TopBar'
import { PlayPill } from '../components/Controls'
import { EpisodeMenu } from '../components/EpisodeRow'
import { Transcript, useTranscript } from '../components/Transcript'
import { AddToQueueIcon, MoreIcon, CheckIcon } from '../components/Icons'

export function Episode() {
  const { podcastId, episodeId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { enqueue, queue, current } = usePlayer()
  const isMobile = useIsMobile()
  const menu = usePopover()
  const [podcast, setPodcast] = useState(location.state?.podcast || null)
  const [episode, setEpisode] = useState(location.state?.episode?.id === episodeId ? location.state.episode : null)
  const [tab, setTab] = useState('notes')
  const tint = useArtworkColor(imageUrl(podcastId))
  const transcript = useTranscript(podcastId, episodeId)

  useEffect(() => {
    let cancelled = false
    document.querySelector('.main')?.scrollTo(0, 0)
    // Always refresh from the API: the passed-in state may be a trimmed
    // copy (e.g. from the persisted queue).
    Promise.all([
      fetch(`/podcasts/${podcastId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
      fetch(`/podcasts/${podcastId}/episodes/${episodeId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    ])
      .then(([p, e]) => { if (!cancelled) { setPodcast(p); setEpisode(e) } })
      .catch(() => { if (!cancelled && !episode) navigate('/not-found', { replace: true }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcastId, episodeId])

  const queued = queue.some(q => q.episode.id === episodeId)
  const isCurrent = current?.episode.id === episodeId
  const hasTranscript = !!transcript

  const notes = episode && (
    <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(episode.description) }} />
  )
  const transcriptCard = episode && podcast && (
    <Transcript podcast={podcast} episode={episode} transcript={transcript} />
  )

  return (
    <>
      <TopBar title={episode?.name} back={`/podcast/${podcastId}`} />
      <div className="hero" style={tint ? { '--tint': tint } : undefined}>
        <div className="hero-inner" style={{ gridTemplateColumns: isMobile ? undefined : '200px minmax(0, 1fr)' }}>
          <Link to={`/podcast/${podcastId}`} aria-label={podcast?.name}>
            <Artwork podcastId={podcastId} className="round-lg shadow" />
          </Link>
          <div className="hero-meta">
            {podcast && <Link to={`/podcast/${podcastId}`} className="eyebrow">{podcast.name}</Link>}
            <h1 className="hero-title" style={{ fontSize: 'clamp(24px, 3vw, 34px)' }}>
              {episode?.name || <span className="skeleton" style={{ display: 'inline-block', width: 320, height: 32 }} />}
            </h1>
            {episode && (
              <div className="hero-sub">
                {formatPublishDate(episode.publish_timestamp)}
                {episodeLength(episode) ? ` · ${formatDuration(episodeLength(episode))}` : ''}
                {hasTranscript ? ' · Transcript available' : ''}
              </div>
            )}
            {episode && podcast && (
              <div className="hero-actions">
                <PlayPill podcast={podcast} episode={episode} large />
                {!isCurrent && (
                  <button type="button" className="btn btn-secondary" style={{ height: 44 }} onClick={() => enqueue(podcast, episode)}>
                    {queued ? <CheckIcon size={18} /> : <AddToQueueIcon size={18} />} {queued ? 'In Up Next' : 'Up Next'}
                  </button>
                )}
                <button type="button" className="icon-btn filled" style={{ width: 44, height: 44 }} onClick={menu.open} aria-label="More actions">
                  <MoreIcon size={20} />
                </button>
                {menu.isOpen && <EpisodeMenu podcast={podcast} episode={episode} anchor={menu.anchor} onClose={menu.close} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page">
        {isMobile ? (
          <>
            {hasTranscript && (
              <div className="segmented" role="tablist" style={{ display: 'grid', marginBottom: 16 }}>
                <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Show Notes</button>
                <button type="button" role="tab" aria-selected={tab === 'transcript'} className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcript</button>
              </div>
            )}
            {tab === 'transcript' && hasTranscript
              ? <div className="card" style={{ height: '70vh', display: 'flex', flexDirection: 'column', paddingTop: 12 }}>{transcriptCard}</div>
              : notes}
          </>
        ) : (
          <div className="episode-columns">
            <section>
              <h2 className="section-title" style={{ marginBottom: 14 }}>Show Notes</h2>
              {notes}
            </section>
            <section className="card sticky-card" aria-label="Transcript">
              <div className="card-head">
                <h3>Transcript</h3>
                {isCurrent && hasTranscript && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Live</span>}
              </div>
              {transcriptCard}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
