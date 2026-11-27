import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import { LibraryProvider } from './lib/LibraryContext'
import { Sidebar, PlayerBar, QueuePanel, MobileDock, Toast } from './components/Shell'
import { NowPlaying } from './components/NowPlaying'
import { Library } from './pages/Library'
import { Show } from './pages/Show'
import { Episode } from './pages/Episode'
import { UpNextPage, AddPodcast, Account, NotFound } from './pages/misc'
import { useEffect, useRef } from 'react'

function ScrollToTop() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    document.querySelector('.main')?.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Shell() {
  const { queueOpen } = usePlayer()
  return (
    <div className={`app ${queueOpen ? 'queue-open' : ''}`}>
      <Sidebar />
      <main className="main" id="main">
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/up-next" element={<UpNextPage />} />
          <Route path="/user-info" element={<Account />} />
          <Route path="/podcast/add" element={<AddPodcast />} />
          <Route path="/podcast/:podcastId" element={<Show />} />
          <Route path="/podcast/:podcastId/episode/:episodeId" element={<Episode />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <QueuePanel />
      <PlayerBar />
      <MobileDock />
      <NowPlaying />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <LibraryProvider>
        <PlayerProvider>
          <Shell />
        </PlayerProvider>
      </LibraryProvider>
    </Router>
  )
}
