import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { imageUrl } from '../lib/format'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange)
    return () => { mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange) }
  }, [query])
  return matches
}

export const useIsMobile = () => useMediaQuery('(max-width: 899px)')

// Square show artwork that fades in once loaded over a neutral placeholder.
export function Artwork({ podcastId, size, className = '', alt = '', children, ...rest }) {
  const [loaded, setLoaded] = useState(false)
  const style = size ? { width: size } : undefined
  return (
    <div className={`art ${className}`} style={style} {...rest}>
      {podcastId && (
        <img
          src={imageUrl(podcastId)}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={loaded ? 'loaded' : ''}
          onLoad={() => setLoaded(true)}
        />
      )}
      {children}
    </div>
  )
}

// Anchored popover on desktop, bottom action sheet on mobile.
export function Popover({ anchor, onClose, children, align = 'end', title, placement = 'auto' }) {
  const isMobile = useIsMobile()
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (isMobile || !anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    // offsetWidth/Height ignore the scale-in animation's transform.
    const p = { width: ref.current.offsetWidth, height: ref.current.offsetHeight }
    const margin = 8
    let top = a.bottom + 6
    let origin = 'top'
    if ((placement === 'top') || (placement === 'auto' && top + p.height > window.innerHeight - margin)) {
      top = a.top - p.height - 6
      origin = 'bottom'
    }
    let left = align === 'end' ? a.right - p.width : align === 'center' ? a.left + a.width / 2 - p.width / 2 : a.left
    left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - p.height - margin))
    setPos({ top, left, origin: `${origin} ${align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'}` })
  }, [anchor, isMobile, align, placement])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    function onDown(e) {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    if (!isMobile) {
      document.addEventListener('pointerdown', onDown, true)
      window.addEventListener('resize', onClose)
    }
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, anchor, isMobile])

  // Focus the first item for keyboard users.
  useEffect(() => {
    const el = ref.current?.querySelector('button, [href], input')
    el?.focus({ preventScroll: true })
  }, [])

  if (isMobile) {
    return createPortal(
      <>
        <div className="sheet-scrim" onClick={onClose} />
        <div className="sheet" ref={ref} role="dialog" aria-label={title}>
          {title && <div className="sheet-title">{title}</div>}
          {children}
        </div>
      </>,
      document.body
    )
  }

  return createPortal(
    <div
      ref={ref}
      className="popover"
      role="menu"
      style={pos ? { top: pos.top, left: pos.left, '--origin': pos.origin } : { top: -9999, left: -9999 }}
    >
      {children}
    </div>,
    document.body
  )
}

export function MenuItem({ icon, children, onClick, checked, trail, ...rest }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${checked ? 'checked' : ''}`} onClick={onClick} {...rest}>
      {icon}
      <span>{children}</span>
      {trail && <span className="trail">{trail}</span>}
    </button>
  )
}

// Small helper for "button that opens a popover" state.
export function usePopover() {
  const [anchor, setAnchor] = useState(null)
  const open = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    setAnchor(a => (a === target ? null : target))
  }, [])
  const close = useCallback(() => setAnchor(null), [])
  return { anchor, open, close, isOpen: !!anchor }
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  )
}

// Watches the nearest scroll container (.main) to toggle the translucent
// sticky header once content scrolls under it.
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const el = document.querySelector('.main')
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > threshold)
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />
}
