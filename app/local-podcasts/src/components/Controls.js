import { useEffect, useState } from 'react'
import { usePlayer, usePlaybackTime, SPEEDS, SKIP_BACK, SKIP_FORWARD, getEpisodeProgress } from '../player/PlayerContext'
import { Popover, MenuItem, usePopover } from './primitives'
import {
  PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, MoonIcon, CheckIcon, CastIcon, AdSkipIcon, CheckCircleIcon,
  PlusIcon,
} from './Icons'
import { formatDuration, formatRemaining } from '../lib/format'

export function PlayPauseButton({ size = 'md' }) {
  const { isPlaying, togglePlay, isBuffering } = usePlayer()
  const icon = size === 'lg' ? 34 : 18
  return (
    <button
      type="button"
      className={`play-btn ${size}`}
      onClick={togglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      style={isBuffering ? { opacity: 0.7 } : undefined}
    >
      {isPlaying ? <PauseIcon size={icon} /> : <PlayIcon size={icon} style={{ marginLeft: size === 'lg' ? 4 : 2 }} />}
    </button>
  )
}

export function SkipButtons({ size = 'md', children }) {
  const { skip } = usePlayer()
  const icon = size === 'lg' ? 38 : 28
  return (
    <>
      <button type="button" className={`skip-btn back ${size}`} onClick={() => skip(-SKIP_BACK)} aria-label={`Back ${SKIP_BACK} seconds`} title={`Back ${SKIP_BACK}s (←)`}>
        <SkipBackIcon size={icon} seconds={SKIP_BACK} />
      </button>
      {children}
      <button type="button" className={`skip-btn fwd ${size}`} onClick={() => skip(SKIP_FORWARD)} aria-label={`Forward ${SKIP_FORWARD} seconds`} title={`Forward ${SKIP_FORWARD}s (→)`}>
        <SkipForwardIcon size={icon} seconds={SKIP_FORWARD} />
      </button>
    </>
  )
}

function fmtSpeed(r) {
  return `${Number(r.toFixed(2))}×`
}

// "1×" button opening presets plus fine ±0.1 adjustment (Apple Podcasts
// iOS 26 style). Speed is remembered per show by the player.
export function SpeedControl({ placement }) {
  const { rate, setRate } = usePlayer()
  const pop = usePopover()
  const step = (delta) => setRate(Math.round(Math.max(0.5, Math.min(3, rate + delta)) * 100) / 100)
  return (
    <>
      <button
        type="button"
        className={`speed-btn ${rate !== 1 ? 'changed' : ''}`}
        onClick={pop.open}
        aria-label={`Playback speed ${fmtSpeed(rate)}`}
        title="Playback speed"
      >
        {fmtSpeed(rate)}
      </button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} align="center" placement={placement} title="Playback Speed">
          <div className="speed-panel">
            <div className="speed-readout">
              <button type="button" className="icon-btn filled" onClick={() => step(-0.1)} aria-label="Slower">
                <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>−</span>
              </button>
              <strong>{fmtSpeed(rate)}</strong>
              <button type="button" className="icon-btn filled" onClick={() => step(0.1)} aria-label="Faster">
                <PlusIcon size={18} />
              </button>
            </div>
            <div className="speed-presets">
              {SPEEDS.map(s => (
                <button type="button" key={s} className={Math.abs(s - rate) < 0.001 ? 'active' : ''} onClick={() => setRate(s)}>
                  {fmtSpeed(s)}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

function useCountdown(endsAt) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [endsAt])
  if (!endsAt) return null
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SleepControl({ placement, className = 'icon-btn' }) {
  const { sleep, setSleep } = usePlayer()
  const pop = usePopover()
  const countdown = useCountdown(sleep?.type === 'time' ? sleep.endsAt : null)
  const choose = (v) => { setSleep(v); pop.close() }
  const label = sleep ? (sleep.type === 'end' ? 'Sleep at end of episode' : `Sleep in ${countdown}`) : 'Sleep timer'
  return (
    <>
      <button type="button" className={`${className} ${sleep ? 'on' : ''}`} onClick={pop.open} aria-label={label} title={label}>
        <MoonIcon size={19} />
      </button>
      {pop.isOpen && (
        <Popover anchor={pop.anchor} onClose={pop.close} placement={placement} title="Sleep Timer">
          {countdown && <div className="menu-label">Ends in {countdown}</div>}
          {[5, 10, 15, 30, 45, 60].map(m => (
            <MenuItem key={m} onClick={() => choose(m)}>{m} minutes</MenuItem>
          ))}
          <MenuItem checked={sleep?.type === 'end'} onClick={() => choose('end')} icon={sleep?.type === 'end' ? <CheckIcon size={16} /> : null}>
            End of episode
          </MenuItem>
          {sleep && (
            <>
              <div className="menu-sep" />
              <MenuItem onClick={() => choose(null)}>Turn off</MenuItem>
            </>
          )}
        </Popover>
      )}
    </>
  )
}

export function AdSkipToggle({ className = 'icon-btn' }) {
  const { adSkip, setAdSkip, adRanges, showToast } = usePlayer()
  const label = adSkip ? 'Skipping detected ads' : 'Ad skipping off'
  return (
    <button
      type="button"
      className={`${className} ${adSkip ? 'on' : ''}`}
      onClick={() => { setAdSkip(!adSkip); showToast(adSkip ? 'Ad skipping off' : 'Ad skipping on') }}
      aria-pressed={adSkip}
      aria-label={label}
      title={`${label}${adRanges.length ? ` · ${adRanges.length} detected in this episode` : ''}`}
    >
      <AdSkipIcon size={20} />
    </button>
  )
}

export function CastButton({ className = 'icon-btn' }) {
  const { cast } = usePlayer()
  if (!cast.isAvailable) return null
  return (
    <button
      type="button"
      className={`${className} ${cast.isConnected ? 'on' : ''}`}
      onClick={cast.request}
      aria-label={cast.isConnected ? `Casting to ${cast.deviceName || 'device'}` : 'Cast to device'}
      title={cast.isConnected ? `Casting to ${cast.deviceName || 'device'}` : 'Cast'}
      style={cast.isConnected ? { color: '#8ab4f8' } : undefined}
    >
      <CastIcon size={19} />
    </button>
  )
}

// Episode play pill: "▶ 42 min", "❚❚ 12 min left" with a progress sliver,
// or "✓ Played". Only the loaded episode's pill subscribes to live time.
export function PlayPill({ podcast, episode, serverPositions, large = false }) {
  const { current } = usePlayer()
  const isCurrent = current?.episode.id === episode.id
  return isCurrent
    ? <LivePill podcast={podcast} episode={episode} large={large} />
    : <StaticPill podcast={podcast} episode={episode} serverPositions={serverPositions} large={large} />
}

function LivePill(props) {
  const live = usePlaybackTime()
  return <PillView {...props} live={live} isCurrent />
}

function StaticPill(props) {
  return <PillView {...props} />
}

function PillView({ podcast, episode, serverPositions, live, isCurrent, large }) {
  const { playEpisode, isPlaying, progress } = usePlayer()
  const prog = getEpisodeProgress(episode, { progress, serverPositions, live })
  const playing = isCurrent && isPlaying
  const remaining = Math.max(0, prog.duration - prog.position)
  const pct = prog.duration > 0 ? (prog.position / prog.duration) * 100 : 0

  let label
  if (prog.done && !isCurrent) label = 'Played'
  else if (prog.started && prog.position > 5) label = formatRemaining(remaining) || 'Resume'
  else label = formatDuration(prog.duration) || (large ? 'Play' : 'Play')
  if (large && !isCurrent && !prog.started) label = `Play${prog.duration ? ` · ${formatDuration(prog.duration)}` : ''}`

  const iconSize = large ? 16 : 12
  return (
    <button
      type="button"
      className={`play-pill ${large ? 'lg' : ''} ${isCurrent ? 'is-current' : ''} ${prog.done && !isCurrent ? 'is-done' : ''}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); playEpisode(podcast, episode) }}
      aria-label={`${playing ? 'Pause' : 'Play'} ${episode.name}`}
    >
      {playing ? <PauseIcon size={iconSize} /> : prog.done && !isCurrent ? <CheckCircleIcon size={iconSize + 2} strokeWidth={2.4} /> : <PlayIcon size={iconSize} />}
      {prog.started && !prog.done && prog.position > 5 && (
        <span className="pill-track"><i style={{ width: `${pct}%` }} /></span>
      )}
      <span>{label}</span>
    </button>
  )
}
