import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayer } from '../player/PlayerContext'
import { useArtworkColor } from '../lib/useArtworkColor'
import { imageUrl, sanitizeHtml } from '../lib/format'
import { Artwork, usePopover, useIsMobile } from './primitives'
import { Scrubber } from './Scrubber'
import { PlayPauseButton, SkipButtons, SpeedControl, SleepControl, AdSkipToggle, CastButton } from './Controls'
import { UpNext } from './UpNext'
import { Transcript, useTranscript } from './Transcript'
import { EpisodeMenu, episodePath } from './EpisodeRow'
import { ChevronDownIcon, MoreIcon, TranscriptIcon, QueueIcon } from './Icons'

// Full-screen Now Playing sheet. Background is tinted from the artwork's
// dominant color with a heavy blur of the art itself (Apple Music/Podcasts
// treatment). Desktop: controls left, Up Next / Transcript / Notes right.
// Mobile: one continuous scroll with the same panels under the controls.
export function NowPlaying() {
  const { current, nowPlayingOpen, setNowPlayingOpen, isPlaying, cast, queue } = usePlayer()
  const [closing, setClosing] = useState(false)
  const [tab, setTab] = useState('transcript')
  const isMobile = useIsMobile()
  const menu = usePopover()
  const sideRef = useRef(null)
  const tint = useArtworkColor(current ? imageUrl(current.podcast.id) : null)
  const transcript = useTranscript(current?.podcast.id, current?.episode.id)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); setNowPlayingOpen(false) }, 260)
  }

  useEffect(() => {
    if (!nowPlayingOpen) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlayingOpen])

  // Default to Up Next when there's no transcript to show.
  useEffect(() => {
    if (transcript === null && tab === 'transcript') setTab('queue')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript])

  if (!nowPlayingOpen || !current) return null
  const { podcast, episode } = current

  const jumpTo = (t) => {
    setTab(t)
    if (isMobile) setTimeout(() => sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  return (
    <div className={`np ${closing ? 'closing' : ''}`} style={tint ? { '--tint': tint } : undefined} role="dialog" aria-modal="true" aria-label="Now Playing">
      <div className="np-bg"><img src={imageUrl(podcast.id)} alt="" /></div>

      <div className="np-top">
        <span className="np-grabber" />
        <button type="button" className="icon-btn filled" onClick={close} aria-label="Close Now Playing" title="Close (Esc)">
          <ChevronDownIcon size={22} />
        </button>
        <div className="np-context">
          {cast.isConnected ? <span className="cast-banner" style={{ justifyContent: 'center' }}>Casting to {cast.deviceName || 'device'}</span> : 'Playing from'}
          <strong className="clamp-1">{podcast.name}</strong>
        </div>
        <button type="button" className="icon-btn filled" onClick={menu.open} aria-label="More actions">
          <MoreIcon size={20} />
        </button>
        {menu.isOpen && <EpisodeMenu podcast={podcast} episode={episode} anchor={menu.anchor} onClose={() => { menu.close() }} />}
      </div>

      <div className="np-scroll">
        <div className="np-layout">
          <div className="np-main">
            <Artwork podcastId={podcast.id} className={`np-art ${isPlaying ? '' : 'paused'}`} alt={podcast.name} />
            <div className="np-titles">
              <div>
                <Link to={episodePath(podcast.id, episode.id)} state={{ podcast, episode }} onClick={close} className="np-title clamp-2">
                  {episode.name}
                </Link>
                <Link to={`/podcast/${podcast.id}`} onClick={close} className="np-show">{podcast.name}</Link>
              </div>
            </div>
            <Scrubber showTimes />
            <div className="np-transport">
              <SpeedControl placement="top" />
              <SkipButtons size="lg">
                <PlayPauseButton size="lg" />
              </SkipButtons>
              <SleepControl placement="top" />
            </div>
            <div className="np-secondary">
              <AdSkipToggle />
              <CastButton />
              <button type="button" className="icon-btn" onClick={() => jumpTo('transcript')} aria-label="Transcript" title="Transcript">
                <TranscriptIcon size={20} />
              </button>
              <button type="button" className="icon-btn" onClick={() => jumpTo('queue')} aria-label="Up Next" title="Up Next">
                <QueueIcon size={20} />
                {queue.length > 0 && <span className="badge" style={{ position: 'absolute', top: 0, right: -2, height: 16, minWidth: 16, fontSize: 10, padding: '0 4px' }}>{queue.length}</span>}
              </button>
            </div>
          </div>

          <div className="np-side" ref={sideRef}>
            <div className="np-side-head">
              <div className="segmented" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>Up Next</button>
                <button type="button" role="tab" aria-selected={tab === 'transcript'} className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcript</button>
                <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Notes</button>
              </div>
            </div>
            <div className="np-side-body">
              {tab === 'queue' && <UpNext compactHeader onClose={close} />}
              {tab === 'transcript' && <Transcript podcast={podcast} episode={episode} transcript={transcript} />}
              {tab === 'notes' && (
                <div style={{ overflowY: 'auto' }}>
                  <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(episode.description) }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
