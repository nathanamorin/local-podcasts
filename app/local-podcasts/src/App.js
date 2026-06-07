import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Grommet, Box } from 'grommet'
import { theme } from './pages/theme'
import { PlayerProvider } from './PlayerContext'
import { PlayerBar, PLAYER_HEIGHT } from './components/PlayerBar'
import { QueueDrawer } from './components/QueueDrawer'
import { Index } from './pages/index'
import { UserInfo } from './pages/user-info'
import { Podcast } from './pages/podcast'
import { PlayPodcast } from './pages/podcast/play'
import { AddPodcast } from './pages/podcast/add'


function App() {
  return (
    <PlayerProvider>
      <Grommet full theme={theme}>
        <Router>
          {/* Main scrollable content — padded so PlayerBar doesn't overlap */}
          <Box fill style={{ paddingBottom: PLAYER_HEIGHT }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/user-info" element={<UserInfo />} />
              <Route path="/podcast/add" element={<AddPodcast />} />
              <Route path="/podcast/:podcastId" element={<Podcast />} />
              <Route path="/podcast/:podcastId/episode/:episodeId" element={<PlayPodcast />} />
            </Routes>
          </Box>
          <PlayerBar />
          <QueueDrawer />
        </Router>
      </Grommet>
    </PlayerProvider>
  )
}

export default App
