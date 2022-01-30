import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link
} from "react-router-dom";

import { Index } from './pages/index'
import { Podcast } from './pages/podcast'
import { PlayPodcast } from './pages/podcast/play'


function App() {
  return (
      <Router>
        <Routes>
          <Route path="/" element={<Index />}/>
          <Route path="/podcast" element={<Podcast />}/>
          <Route path="/podcast/play" element={<PlayPodcast />}/>
        </Routes>
      </Router>

  )
}

export default App
