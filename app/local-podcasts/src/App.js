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
import { AddPodcast } from './pages/podcast/add'


function App() {
  return (
      <Router>
        <Routes>
          <Route path="/" element={<Index />}/>
          <Route path="/podcast" element={<Podcast />}/>
          <Route path="/podcast/play" element={<PlayPodcast />}/>
          <Route path="/podcast/add" element={<AddPodcast />}/>
        </Routes>
      </Router>

  )
}

export default App
