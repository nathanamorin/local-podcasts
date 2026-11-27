// Inline SVG icon set (stroke icons in the SF Symbols / Lucide idiom, plus
// filled transport glyphs). Inline so there's no icon-font or extra
// dependency, and so icons inherit currentColor.

function Svg({ size = 20, strokeWidth = 2, children, fill = 'none', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1l11.3-7.2c.7-.5.7-1.5 0-2L8.8 3.8C8 3.3 7 3.9 7 4.8z" />
  </svg>
)

export const PauseIcon = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.4" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.4" />
  </svg>
)

// Circular-arrow skip glyphs with the interval drawn inside, like every
// major podcast player.
export const SkipBackIcon = ({ size = 28, seconds = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M7.2 11.5A10.5 10.5 0 1 1 5.5 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M7.6 5.6v6.3h6.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <text x="16.6" y="21" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" fontFamily="-apple-system, system-ui, sans-serif">{seconds}</text>
  </svg>
)

export const SkipForwardIcon = ({ size = 28, seconds = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M24.8 11.5A10.5 10.5 0 1 0 26.5 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M24.4 5.6v6.3h-6.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <text x="15.4" y="21" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" fontFamily="-apple-system, system-ui, sans-serif">{seconds}</text>
  </svg>
)

export const NextIcon = (p) => (
  <Svg {...p}><path d="M5 5l9 7-9 7V5z" fill="currentColor" /><path d="M18 5v14" /></Svg>
)

export const LibraryIcon = (p) => (
  <Svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></Svg>
)

export const QueueIcon = (p) => (
  <Svg {...p}><path d="M3 6h13M3 12h13M3 18h8" /><path d="M16 15.5v5.5l4.5-2.75L16 15.5z" fill="currentColor" /></Svg>
)

export const AddToQueueIcon = (p) => (
  <Svg {...p}><path d="M3 6h12M3 12h12M3 18h7" /><path d="M18 14v7M14.5 17.5h7" /></Svg>
)

export const PlayNextIcon = (p) => (
  <Svg {...p}><path d="M3 18h12M3 12h12" /><path d="M14 3.5v6l5-3-5-3z" fill="currentColor" /><path d="M3 6h7" /></Svg>
)

export const PlusIcon = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)

export const PlusCircleIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Svg>
)

export const MoreIcon = (p) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></Svg>
)

export const CheckIcon = (p) => (
  <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
)

export const CheckCircleIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></Svg>
)

export const CircleIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /></Svg>
)

export const SearchIcon = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>
)

export const CloseIcon = (p) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
)

export const ChevronDownIcon = (p) => (
  <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
)

export const ChevronLeftIcon = (p) => (
  <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>
)

export const ChevronRightIcon = (p) => (
  <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>
)

export const StarIcon = ({ filled, ...p }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></Svg>
)

export const UserIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></Svg>
)

export const RefreshIcon = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 0 0-14.6-4.3L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.3L20 15.5" /><path d="M20 20v-4.5h-4.5" /></Svg>
)

export const CastIcon = (p) => (
  <Svg {...p}><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /><path d="M3 12a8 8 0 0 1 8 8M3 16a4 4 0 0 1 4 4" /><circle cx="3.5" cy="19.5" r=".8" fill="currentColor" /></Svg>
)

export const MoonIcon = (p) => (
  <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>
)

export const SunIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></Svg>
)

export const MonitorIcon = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>
)

export const AdSkipIcon = (p) => (
  <Svg {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="3" /><path d="M6.5 15l2-6 2 6M7.2 13h2.6M13.5 9v6h1.3a3 3 0 0 0 0-6h-1.3z" strokeWidth="1.7" /></Svg>
)

export const TrashIcon = (p) => (
  <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Svg>
)

export const GripIcon = (p) => (
  <Svg {...p} strokeWidth={0}><g fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></g></Svg>
)

export const TranscriptIcon = (p) => (
  <Svg {...p}><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9h8M8 12.5h5" /></Svg>
)

export const NotesIcon = (p) => (
  <Svg {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h5" /></Svg>
)

export const ExpandIcon = (p) => (
  <Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>
)

export const PodcastIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="10" r="2.5" /><path d="M12 14.5v6" /><path d="M7.5 15a6 6 0 1 1 9 0" /><path d="M5 18.5a9.5 9.5 0 1 1 14 0" /></Svg>
)

export const LinkIcon = (p) => (
  <Svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>
)

export const ArrowUpIcon = (p) => (
  <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
)

export const ArrowDownIcon = (p) => (
  <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
)

export const FilterIcon = (p) => (
  <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>
)
