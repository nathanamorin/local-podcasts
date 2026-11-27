import { useEffect, useState } from 'react'

// Cache of url -> {r,g,b} so each artwork is only sampled once per load.
const cache = new Map()

// Picks a vivid-but-not-blown-out representative color from an image by
// downsampling it to a tiny canvas and averaging pixels weighted by their
// saturation. Artwork is served same-origin, so the canvas isn't tainted.
function sample(img) {
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  let r = 0, g = 0, b = 0, total = 0
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2]
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = (max + min) / 2 / 255
    // Favor saturated mid-tones; near-white/near-black pixels barely count.
    const w = 0.08 + sat * (1 - Math.abs(lum - 0.5) * 1.6)
    if (w <= 0) continue
    r += pr * w; g += pg * w; b += pb * w; total += w
  }
  if (!total) return null
  r /= total; g /= total; b /= total
  // Cap brightness so white text on tinted surfaces stays legible even for
  // mostly-white artwork (WCAG-ish: keep the brightest channel <= ~150).
  const max = Math.max(r, g, b)
  if (max > 150) { const k = 150 / max; r *= k; g *= k; b *= k }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) }
}

// Returns an "r, g, b" string (for use inside rgb()/rgba()) derived from
// the given artwork, or null until it's been sampled. Used to tint the show
// header and Now Playing backgrounds the way Apple Podcasts/Music do.
export function useArtworkColor(url) {
  const [color, setColor] = useState(() => (url && cache.get(url)) || null)

  useEffect(() => {
    if (!url) { setColor(null); return }
    if (cache.has(url)) { setColor(cache.get(url)); return }
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const c = sample(img)
        const value = c ? `${c.r}, ${c.g}, ${c.b}` : null
        cache.set(url, value)
        if (!cancelled) setColor(value)
      } catch {
        cache.set(url, null)
      }
    }
    img.src = url
    return () => { cancelled = true }
  }, [url])

  return color
}
