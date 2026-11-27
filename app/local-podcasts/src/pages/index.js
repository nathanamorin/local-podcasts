import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from "react-router-dom"
import { Box, Button, InfiniteScroll, Text } from 'grommet'
import { AddCircle, Star, User, Update } from 'grommet-icons'
import { Header } from '../components/Header'
import { cardBackground } from './theme'

// How many podcasts the backend returns per /podcasts page.
const PAGE_SIZE = 24

// Minimum card width used by the responsive grid — the grid reflows its
// column count to whatever fits, rather than relying on a fixed wrap
// layout that left large gaps/odd centering at in-between viewport widths.
const CARD_MIN_WIDTH = '170px'

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

  // starred is derived client-side from the loaded podcasts and the
  // starred-ids list, rather than re-fetched from the server, so toggling a
  // star doesn't disturb the paginated load state.
  const displayed = podcasts.map(p => ({ ...p, starred: starredPodcasts.includes(p.id) }))

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

  function toggleStar(podcast) {
    const starred = starredPodcasts.includes(podcast.id)
    const newStars = starred
      ? starredPodcasts.filter(id => id !== podcast.id)
      : [...starredPodcasts, podcast.id]
    setStarredPodcasts(newStars)
    fetch(`/me/favorites/${encodeURIComponent(podcast.id)}`, { method: starred ? 'DELETE' : 'PUT' })
  }

  return (
    <Box fill>
      <Header
        title="Podcasts"
        back={false}
        search={{ value: searchText, onChange: e => setSearchText(e.target.value), placeholder: 'Search your podcasts' }}
        actions={[
          <Link key="add" to="/podcast/add"><Button icon={<AddCircle />} tip="Add podcast" plain hoverIndicator style={{ padding: '8px', borderRadius: '8px' }} /></Link>,
          <Link key="user" to="/user-info"><Button icon={<User />} tip="Account" plain hoverIndicator style={{ padding: '8px', borderRadius: '8px' }} /></Link>,
          <Button
            key="refresh"
            icon={<Update />}
            tip="Refresh feeds"
            plain
            hoverIndicator
            style={{ padding: '8px', borderRadius: '8px' }}
            onClick={() => fetch(`/refresh`).then(r => r.json()).then(re => console.log(re))}
          />,
        ]}
      />

      {results.length === 0 ? (
        <Box align="center" justify="center" pad="large" flex>
          <Text color="text-weak">
            {searchText ? 'No podcasts match your search.' : 'No podcasts yet — add one to get started.'}
          </Text>
        </Box>
      ) : (
        <Box
          pad={{ horizontal: 'medium', top: 'medium', bottom: 'large' }}
          flex="grow"
          overflow="auto"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}, 1fr))`,
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <InfiniteScroll items={results} step={12} onMore={loadMore}>
            {(podcast) => (
              <Link
                key={podcast.id}
                to={`/podcast/${podcast.id}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <Box
                  background={cardBackground}
                  round="medium"
                  overflow="hidden"
                  animation={{ type: 'fadeIn', size: 'medium' }}
                  className="podcast-card"
                >
                  <Box style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                    <Box
                      fill
                      background={{ color: 'background-contrast', image: `url('/podcasts/${podcast.id}/image')`, size: 'cover' }}
                    />
                    <Button
                      icon={<Star size="small" color={podcast.starred ? '#ff5a3c' : 'white'} fill={podcast.starred ? '#ff5a3c' : 'none'} />}
                      onClick={e => { e.preventDefault(); toggleStar(podcast) }}
                      plain
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        padding: '6px',
                        borderRadius: '999px',
                        background: 'rgba(0,0,0,0.45)',
                      }}
                    />
                  </Box>
                  <Box pad={{ horizontal: 'small', vertical: 'small' }} gap="2px">
                    <Text size="small" weight="bold" color="text" truncate>
                      {podcast.name}
                    </Text>
                    <Text size="xsmall" color="text-weak" truncate>
                      {podcast.latest_episode?.name}
                    </Text>
                  </Box>
                </Box>
              </Link>
            )}
          </InfiniteScroll>
        </Box>
      )}
    </Box>
  )
}
