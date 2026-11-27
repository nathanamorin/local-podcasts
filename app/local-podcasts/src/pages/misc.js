import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLibrary } from '../lib/LibraryContext'
import { usePlayer } from '../player/PlayerContext'
import { safeGet, safeSet } from '../lib/storage'
import { TopBar } from '../components/TopBar'
import { UpNext } from '../components/UpNext'
import { Switch } from '../components/primitives'
import { LinkIcon, PodcastIcon, SunIcon, MoonIcon, MonitorIcon } from '../components/Icons'

export function UpNextPage() {
  return (
    <>
      <TopBar title="Up Next" />
      <div className="page" style={{ padding: 0 }}>
        <div style={{ padding: '0 8px' }}>
          <h1 className="large-title" style={{ padding: '0 8px 8px' }}>Up Next</h1>
          <UpNext compactHeader />
        </div>
      </div>
    </>
  )
}

export function AddPodcast() {
  const navigate = useNavigate()
  const { reload } = useLibrary()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const url = value.trim()
    if (!url) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/podcasts', { method: 'POST', body: JSON.stringify({ rss_url: url }) })
      if (!res.ok) throw new Error()
      await reload()
      navigate('/')
    } catch {
      setSubmitting(false)
      setError('Couldn’t add that feed. Check the RSS URL and try again.')
    }
  }

  return (
    <>
      <TopBar title="Add Show" />
      <div className="page">
        <div className="narrow" style={{ paddingTop: 24 }}>
          <div className="empty-icon" style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 20 }}>
            <PodcastIcon size={30} />
          </div>
          <h1 className="large-title">Add a Show</h1>
          <p style={{ color: 'var(--text-2)', marginTop: 8, marginBottom: 28, fontSize: 16 }}>
            Paste a podcast’s RSS feed. New episodes download automatically, get scanned for ads, and are transcribed in the background.
          </p>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label htmlFor="rss" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>RSS feed URL</label>
            <div style={{ position: 'relative' }}>
              <input
                id="rss"
                className="text-field"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoFocus
                placeholder="https://example.com/feed.xml"
                value={value}
                onChange={e => setValue(e.target.value)}
                style={{ paddingLeft: 42 }}
              />
              <span style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-3)' }}><LinkIcon size={20} /></span>
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || !value.trim()} style={{ marginTop: 8 }}>
              {submitting ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 20 }}>
            Tip: most podcast websites link their feed as “RSS”. Apple Podcasts and Spotify pages don’t expose it directly.
          </p>
        </div>
      </div>
    </>
  )
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
}

export function Account() {
  const { adSkip, setAdSkip, showToast, clearHistory: clear } = usePlayer()
  const [user, setUser] = useState(undefined)
  const [theme, setTheme] = useState(() => safeGet('theme') || 'system')

  useEffect(() => {
    fetch('/me').then(r => r.json()).then(d => setUser(d.user_id)).catch(() => setUser(null))
  }, [])

  function chooseTheme(t) {
    setTheme(t)
    safeSet('theme', t)
    applyTheme(t)
  }

  function clearHistory() {
    clear()
    showToast('Listening history cleared')
  }

  const initial = user && user !== 'anonymous' ? user[0].toUpperCase() : '?'

  return (
    <>
      <TopBar title="Account" />
      <div className="page">
        <div className="narrow">
          <h1 className="large-title">Account</h1>

          <div className="group" style={{ marginTop: 24 }}>
            <div className="group-row" style={{ minHeight: 76 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(145deg, #ff8a4c, var(--accent))', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 20 }}>
                {initial}
              </div>
              <div className="label">
                <strong>{user === undefined ? '…' : user && user !== 'anonymous' ? user : 'Not signed in'}</strong>
                <span>Favorites follow this account across devices.</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="group-title">Playback</div>
            <div className="group">
              <div className="group-row">
                <div className="label">
                  <strong>Skip detected ads</strong>
                  <span>Jump over segments matched as ads by audio fingerprinting. Marked in amber on the scrubber.</span>
                </div>
                <Switch checked={adSkip} onChange={setAdSkip} label="Skip detected ads" />
              </div>
              <div className="group-row">
                <div className="label">
                  <strong>Playback speed</strong>
                  <span>Set from the player; remembered per show.</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="group-title">Appearance</div>
            <div className="group">
              <div className="group-row">
                <div className="label"><strong>Theme</strong></div>
                <div className="segmented">
                  <button type="button" className={theme === 'system' ? 'active' : ''} onClick={() => chooseTheme('system')} aria-label="System theme"><MonitorIcon size={16} /></button>
                  <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => chooseTheme('light')} aria-label="Light theme"><SunIcon size={16} /></button>
                  <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => chooseTheme('dark')} aria-label="Dark theme"><MoonIcon size={16} /></button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="group-title">Keyboard shortcuts</div>
            <div className="group">
              <div className="group-row"><div className="label"><strong>Play / Pause</strong></div><span className="kbd">Space</span></div>
              <div className="group-row"><div className="label"><strong>Back 15 seconds</strong></div><span className="kbd">←</span></div>
              <div className="group-row"><div className="label"><strong>Forward 30 seconds</strong></div><span className="kbd">→</span></div>
              <div className="group-row"><div className="label"><strong>Close Now Playing</strong></div><span className="kbd">Esc</span></div>
            </div>
          </div>

          <div style={{ marginTop: 32 }}>
            <div className="group">
              <button type="button" className="group-row" style={{ width: '100%', color: 'var(--danger)', fontWeight: 550 }} onClick={clearHistory}>
                Clear listening history on this device
              </button>
            </div>
            <p className="group-caption">Playback positions stay synced; this only clears “Continue Listening”.</p>
          </div>
        </div>
      </div>
    </>
  )
}

export function NotFound() {
  return (
    <div className="empty" style={{ minHeight: '70vh', justifyContent: 'center' }}>
      <div className="empty-icon"><PodcastIcon size={28} /></div>
      <h3>Nothing here</h3>
      <p>That page doesn’t exist, or the episode has been removed from its feed.</p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 8 }}>Back to Library</Link>
    </div>
  )
}
