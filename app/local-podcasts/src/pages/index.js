import React, { useState, useEffect } from 'react'
import { Link } from "react-router-dom";
import { Grommet, Box, Heading, Paragraph, Button, TextInput, InfiniteScroll } from 'grommet'
import { AddCircle } from 'grommet-icons'
import Fuse from 'fuse.js'
import { theme, background, cardBackground } from './theme'

const searchOptions = {
  includeScore: false,
  keys: ['name']
}


export function Index() {

  const [podcasts, setPodcasts] = useState({ podcastsSearch: new Fuse([], searchOptions), podcasts: [] })

  const [searchText, setSearchText] = useState("")


  useEffect(() => {
    fetch(`/podcasts`)
      .then((response) => response.json())
      .then(({ podcasts }) => setPodcasts({ podcastsSearch: new Fuse(podcasts, searchOptions), podcasts }))
  }, [])


  let results;
  if (searchText !== "") {
    results = podcasts.podcastsSearch.search(searchText).map(x => x.item)
  } else {
    results = podcasts.podcasts
  }

  return (
    <Grommet full theme={theme}>
      <Box fill="vertical" background={background} overflow="auto" 
        align="start" justify="center" pad="small" height="xlarge" 
        flex={false} fill="vertical" direction="row" wrap overflow="scroll">

        <Box align="center" justify="end" direction="row" fill="horizontal" pad="large">
          <TextInput
            placeholder="Search"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            outline="none"
          />
          <Link to="/podcast/add">
            <Button icon={<AddCircle />} margin="small" />
          </Link>
        </Box>
        <InfiniteScroll items={results} replace={true}>
          {(podcast) => (
              <Link to="/podcast"
              state={{ podcast: podcast }}
              style={{ textDecoration: 'none' }}
              key={podcast.id}
            >
              <Box align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
                <Box align="center" justify="center" pad="xsmall" margin="xsmall">
                  <Box align="center" justify="center" background={{ "dark": false, "color": "light-2", "image": `url('/podcasts/${podcast.id}/image')` }} round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
                  <Heading level="2" size="medium" margin="xsmall" textAlign="center" >
                    {podcast.name}
                  </Heading>
                  <Paragraph size="small" margin="medium" textAlign="center">
                    Latest: {podcast.latest_episode.name} {(new Date(podcast.latest_episode.publish_timestamp * 1000)).toLocaleDateString()}
                  </Paragraph>
                </Box>
              </Box>
            </Link>

          )
          }
        </InfiniteScroll>
      </Box>

    </Grommet>
  )
}
