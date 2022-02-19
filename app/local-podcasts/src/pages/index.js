import React, { useState, useEffect, useRef } from 'react'
import { Link } from "react-router-dom";
import { Grommet, Box, Heading, Paragraph, Button, TextInput, InfiniteScroll } from 'grommet'
import { AddCircle, Star, User } from 'grommet-icons'
import Fuse from 'fuse.js'
import { theme, background, cardBackground } from './theme'
import { setClientInfo, getClientInfo, deleteClientInfo } from './utils';

const searchOptions = {
  includeScore: false,
  keys: ['name']
}

const starredPodcastsKey = "starred-podcasts"


export function Index() {

  const [podcasts, setPodcasts] = useState({ podcastsSearch: new Fuse([], searchOptions), podcasts: [] })

  const [searchText, setSearchText] = useState("")

  const [starredPodcasts, setStarredPodcasts] = useState([])

  const isInitialMount = useRef(true)

  useEffect(async () => {
    let starredPodcastsInit = await getClientInfo(starredPodcastsKey)
    if (starredPodcastsInit !== null) {
      try {
        starredPodcastsInit = JSON.parse(starredPodcastsInit)
      } catch {
          await deleteClientInfo(starredPodcastsKey)
          starredPodcastsInit = []
      }
    } else {
      starredPodcastsInit = []
    }

    setStarredPodcasts(starredPodcastsInit)
  
  }, [])


  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
   }
    fetch(`/podcasts`)
      .then((response) => response.json())
      .then(({ podcasts }) => podcasts.map(p => {
        p.starred = starredPodcasts.includes(p.id)
        if (p.starred) {
          p.starColor = "gold"
        } else {
          p.starColor = "text"
        }
        return p
      }))
      .then((podcasts) => setPodcasts({ podcastsSearch: new Fuse(podcasts, searchOptions), podcasts }))
  }, [starredPodcasts])



  let results;
  if (searchText !== "") {
    results = podcasts.podcastsSearch.search(searchText).map(x => x.item)
  } else {
    results = podcasts.podcasts.sort((ele1, ele2) => {
      if (ele1.starred && !ele2.starred) return -1
      if (!ele1.starred && ele2.starred) return 1
      return 0
    })
  }

  return (
    <Grommet full theme={theme}>
      <Box fill="vertical" background={background} overflow="auto" 
        align="start" justify="center" pad="small" height="xlarge" 
        flex={false} fill="vertical" direction="row" wrap overflow="scroll">

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
        </Box>
        <InfiniteScroll items={results} replace={true}>
          {(podcast) => (
              <Box key={podcast.id} align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
                <Box justify="end" alignSelf="end" basis="0px" flex="shrink">
                  <Button icon={<Star color={podcast.starColor}/>} size="large" style={{transform: "translateY(100%)"}} onClick={e => {
                    const newStars = [...starredPodcasts]
                    const starIdx = newStars.indexOf(podcast.id)
                    if (starIdx === -1) {
                      newStars.push(podcast.id)
                    } else {
                      newStars.splice(starIdx, 1)
                    }
                    setStarredPodcasts(newStars)
                    setClientInfo(starredPodcastsKey, JSON.stringify(newStars))
                  }}/>
                </Box>
                <Link to="/podcast"
                  state={{ podcast: podcast }}
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


          )
          }
        </InfiniteScroll>
      </Box>

    </Grommet>
  )
}
