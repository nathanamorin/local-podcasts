// Formatting helpers shared across the UI.

// "1:02:03" / "4:05" — used on the scrubber and transcript timestamps.
export function formatClock(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// "1 hr 5 min" / "42 min" / "<1 min" — used for episode lengths.
export function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return ''
  const mins = Math.round(totalSeconds / 60)
  if (mins < 1) return '<1 min'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

// "12 min left" — shown on partially played episodes.
export function formatRemaining(totalSeconds) {
  const d = formatDuration(totalSeconds)
  return d ? `${d} left` : ''
}

const DAY = 24 * 60 * 60 * 1000

// Relative publish dates in the style podcast apps use: "Today",
// "Yesterday", weekday within the last week, then "Nov 3" / "Nov 3, 2024".
export function formatPublishDate(unixSeconds) {
  if (!unixSeconds) return ''
  const date = new Date(unixSeconds * 1000)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = date.getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - DAY) return 'Yesterday'
  if (t >= startOfToday - 6 * DAY) return date.toLocaleDateString(undefined, { weekday: 'long' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

// Converts feed HTML to plain text, decoding entities and keeping line
// breaks from <br>/<p> so snippets read naturally.
export function htmlToText(html) {
  if (!html) return ''
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

const ALLOWED_TAGS = new Set(['P', 'BR', 'A', 'EM', 'STRONG', 'B', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4'])

// Minimal allow-list sanitizer for RSS show notes: keeps basic formatting
// and http(s) links, drops everything else (scripts, styles, attributes,
// images, iframes) while preserving its text content.
export function sanitizeHtml(html) {
  if (!html) return ''
  const src = new DOMParser().parseFromString(html, 'text/html')
  const out = document.createElement('div')

  function walk(node, parent) {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(child.textContent))
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const tag = child.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME') return
      if (!ALLOWED_TAGS.has(tag)) {
        walk(child, parent)
        return
      }
      const el = document.createElement(tag)
      if (tag === 'A') {
        const href = child.getAttribute('href') || ''
        if (/^https?:\/\//i.test(href)) {
          el.setAttribute('href', href)
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        }
      }
      walk(child, el)
      parent.appendChild(el)
    })
  }

  walk(src.body, out)
  return out.innerHTML
}

export function imageUrl(podcastId) {
  return `/podcasts/${podcastId}/image`
}

// Episode length in seconds, or 0 if unknown. Until the download worker
// measures the real duration, the backend's audio_length_sec holds the RSS
// enclosure's byte count, so implausibly large values are treated as unknown.
const MAX_PLAUSIBLE_SEC = 12 * 3600
export function episodeLength(episode) {
  const v = Number(episode?.audio_length_sec) || 0
  return v > 0 && v <= MAX_PLAUSIBLE_SEC ? v : 0
}
