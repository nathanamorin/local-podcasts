import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route
} from "react-router-dom"

import { Index } from './pages/index'
import { UserInfo } from './pages/user-info'
import { Podcast } from './pages/podcast'
import { PlayPodcast } from './pages/podcast/play'
import { AddPodcast } from './pages/podcast/add'


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Index />}/>
        <Route path="/user-info" element={<UserInfo />}/>
        <Route path="/podcast/add" element={<AddPodcast />}/>
        <Route path="/podcast/:podcastId" element={<Podcast />}/>
        <Route path="/podcast/:podcastId/episode/:episodeId" element={<PlayPodcast />}/>
      </Routes>
    </Router>
  )
}

export default App
