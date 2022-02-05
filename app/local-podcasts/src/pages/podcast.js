import React, { useState, useEffect } from 'react'
import { Grommet, Box, List, Button, Text, Heading, Paragraph, TextInput } from 'grommet'
import { Play, Previous } from 'grommet-icons'
import { Link, useLocation, useNavigate } from "react-router-dom"
import Fuse from 'fuse.js'
import { theme, background, cardBackground } from './theme'

const searchOptions = {
  includeScore: false,
  keys: ['name', 'description']
}


export function Podcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const podcast = location.state.podcast

  const [episodes, setEpisodes] = useState(new Fuse([], searchOptions))

  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    fetch(`/podcasts/${podcast.id}`)
      .then(data => {
        return data.json()
      })
      .then(data => {
        setEpisodes(new Fuse(data.episodes, searchOptions))
      })
      .catch(err => {
        console.log(err)
      })
  }, [])


  let searchedEpisodes;
  if (searchText !== "") {
    searchedEpisodes = episodes.search(searchText);
  } else {
    searchedEpisodes = episodes.getIndex().docs.map((item) => ({ item, matches: [], score: 1 }));
  }

  searchedEpisodes = searchedEpisodes.map(x => x.item)


  return (
    <Grommet full theme={theme}>
      <Box align="center" justify="center" pad="small" background={background} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">
      <Box justify="center" align="start" fill="horizontal">
        <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />}/>
      </Box>
        <Box align="center" pad="small" background={cardBackground} round="medium" margin="medium" direction="column" alignSelf="center" animation={{ "type": "fadeIn", "size": "medium" }}>
          <Box align="center" justify="center" pad="xsmall" margin="xsmall">
            <Box align="center" justify="center" background={{ "dark": false, "color": "light-2", "image": `url('/podcasts/${podcast.id}/image')` }} round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
            <Heading level="2" size="medium" margin="xsmall" textAlign="center">
              {podcast.name}
            </Heading>
            <Paragraph size="small" margin="medium" textAlign="center">
              {podcast.description.replace(/(<([^>]+)>)/gi, "")}
            </Paragraph>
          </Box>
        </Box>
        <TextInput
          placeholder="Search"
          value={searchText}
          onChange={event => setSearchText(event.target.value)}
          focusIndicator={false}
        />


        <Box fill="horizontal" pad={{top: "medium"}}>
          <List data={searchedEpisodes} paginate={false}>
            {(episode) => (
              <Box align="center" justify="start" fill="horizontal" direction="row-responsive" pad="xxsmall">

                <Box align="center" justify="start" direction="row" >
                  <Box align="start" justify="start" fill="vertical" direction="column" pad="small" >
                    <Link to="/podcast/play" state={{ podcast: podcast, episode: episode }}  >
                      <Button icon={<Play />} />
                    </Link>
                  </Box>
                  <Box align="start" justify="start" direction="column" >
                    <Text>
                      {episode.name}
                    </Text>
                  </Box>
                </Box>

                <Box align="end" justify="end" direction="column" >
                  <Text>
                    {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
                  </Text>
                </Box>
              </Box>
            )}
          </List>
        </Box>


      </Box>

    </Grommet>
  )
}