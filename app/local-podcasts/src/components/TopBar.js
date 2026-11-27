import { useNavigate } from 'react-router-dom'
import { useScrolled } from './primitives'
import { ChevronLeftIcon } from './Icons'

// Sticky page header: transparent over the hero, turns into a translucent
// glass bar with the page title once content scrolls beneath it.
export function TopBar({ title, back, children }) {
  const scrolled = useScrolled(back ? 120 : 40)
  const navigate = useNavigate()
  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
      {back && (
        <button
          type="button"
          className="icon-btn filled"
          onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(typeof back === 'string' ? back : '/'))}
          aria-label="Back"
        >
          <ChevronLeftIcon size={20} />
        </button>
      )}
      <div className="topbar-title">{title}</div>
      {children}
    </header>
  )
}
