import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from "react-router-dom"
import { Grommet, Box, Heading, Paragraph, Button, TextInput, InfiniteScroll } from 'grommet'
import { AddCircle, Star, User, Update } from 'grommet-icons'
import { theme, background, cardBackground } from './theme'

// How many podcasts the backend returns per /podcasts page.
const PAGE_SIZE = 24


export function Index() {

  // Podcasts loaded so far, across however many pages have been fetched.
  const [podcasts, setPodcasts] = useState([])

  const [searchText, setSearchText] = useState("")

  const [starredPodcasts, setStarredPodcasts] = useState([])

  // Mirrors in-flight/has-more state in refs (rather than only state) so
  // loadMore - called from InfiniteScroll's onMore - always sees the latest
  // value, not a stale one captured by an earlier render's closure.
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const nextPageRef = useRef(1)

  // Favorites are stored server-side, scoped to the authenticated user
  // (X-Auth-Request-User, injected by Istio's Pocket ID SSO gate), so they
  // follow the user across devices instead of being per-browser.
  useEffect(() => {
    fetch('/me/favorites')
      .then(r => r.ok ? r.json() : { podcast_ids: [] })
      .then(data => setStarredPodcasts(data.podcast_ids || []))
      .catch(() => setStarredPodcasts([]))
  }, [])

  // Fetches the next page of podcasts from the server and appends it.
  // Passed to InfiniteScroll as onMore, so it's called automatically as the
  // user scrolls near the end of what's currently loaded.
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) {
      return
    }
    loadingRef.current = true
    const page = nextPageRef.current

    fetch(`/podcasts?page=${page}&page_size=${PAGE_SIZE}`)
      .then((response) => response.json())
      .then(({ podcasts: newPodcasts, pagination }) => {
        setPodcasts((prev) => [...prev, ...newPodcasts])
        hasMoreRef.current = pagination.has_more
        nextPageRef.current = page + 1
      })
      .finally(() => {
        loadingRef.current = false
      })
  }, [])

  // Initial load of the first page.
  useEffect(() => {
    loadMore()
  }, [])

  // starred/starColor are derived client-side from the loaded podcasts and
  // the starred-ids list, rather than re-fetched from the server, so toggling
  // a star doesn't disturb the paginated load state.
  const displayed = podcasts.map(p => {
    const starred = starredPodcasts.includes(p.id)
    return { ...p, starred, starColor: starred ? "gold" : "text" }
  })

  let results;
  if (searchText !== "") {
    results = displayed.filter(x => x.name.toLowerCase().includes(searchText.toLowerCase()))
  } else {
    results = [...displayed].sort((ele1, ele2) => {
      if (ele1.starred && !ele2.starred) return -1
      if (!ele1.starred && ele2.starred) return 1
      return 0
    })
  }

  return (
    <Grommet full theme={theme} background={background}>
      <Box>
        <Box align="center" justify="end" direction="row" fill="horizontal" pad="small">
            <TextInput
              placeholder="Search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              outline="none"
            />
            <Link to="/podcast/add">
              <Button icon={<AddCircle />} margin="none" />
            </Link>
            <Link to="/user-info">
              <Button icon={<User />} margin="none" />
            </Link>
            <Button icon={<Update />} margin="none" onClick={()=>{
              fetch(`/refresh`)
              .then((response) => response.json())
              .then((re) => console.log(re))
            }}/>
        </Box>
      </Box>
      <Box justify="center">
        <Box fill="horizontal" direction="row" align="center" justify="center" wrap={true}>
          <InfiniteScroll items={results} step={8} onMore={loadMore}>
            {(podcast) => (
              <Box key={podcast.id} width={{max: "300px"}} align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
                <Box justify="end" alignSelf="end" basis="0px" flex="shrink">
                  <Button icon={<Star color={podcast.starColor}/>} size="large" style={{transform: "translateY(100%)"}} onClick={e => {
                    const newStars = [...starredPodcasts]
                    const starIdx = newStars.indexOf(podcast.id)
                    if (starIdx === -1) {
                      newStars.push(podcast.id)
                      fetch(`/me/favorites/${encodeURIComponent(podcast.id)}`, { method: 'PUT' })
                    } else {
                      newStars.splice(starIdx, 1)
                      fetch(`/me/favorites/${encodeURIComponent(podcast.id)}`, { method: 'DELETE' })
                    }
                    setStarredPodcasts(newStars)
                  }}/>
                </Box>
                <Link to={`/podcast/${podcast.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <Box align="center" justify="center" pad="xsmall" margin="xsmall">
                    <Box align="center" justify="center" background={{ "dark": false, "color": "light-2", "image": `url('/podcasts/${podcast.id}/image')` }} round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
                    <Heading level="2" size="medium" margin="xsmall" textAlign="center" color="text">
                      {podcast.name}
                    </Heading>
                    <Paragraph size="small" margin="medium" textAlign="center" color="text">
                      Latest: {podcast.latest_episode.name} {(new Date(podcast.latest_episode.publish_timestamp * 1000)).toLocaleDateString()}
                    </Paragraph>
                  </Box>
                </Link>
              </Box>
            )}
          </InfiniteScroll>
        </Box>
      </Box>

    </Grommet>
  )
}
