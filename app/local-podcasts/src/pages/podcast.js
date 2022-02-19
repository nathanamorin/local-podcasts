import React, { useState, useEffect } from 'react'
import { Grommet, Box, InfiniteScroll, Button, Text, Heading, Paragraph, TextInput } from 'grommet'
import { Play, Previous } from 'grommet-icons'
import { Link, useLocation, useNavigate } from "react-router-dom"
import Fuse from 'fuse.js'
import { theme, background, cardBackground } from './theme'
import { getClientInfo, setClientInfo, deleteClientInfo } from './utils'

const searchOptions = {
  includeScore: false,
  keys: ['name']
}

const playedEpisodesKey = "played-episodes"


export function Podcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const podcast = location.state.podcast

  const [episodes, setEpisodes] = useState(new Fuse([], searchOptions))

  const [playedEpisodes, setPlayedEpisode] = useState({})

  const [searchText, setSearchText] = useState("")

  const playedEpisodesKey = `played-episodes-${podcast.id}`

  useEffect(async () => {
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

      const data = await getClientInfo(playedEpisodesKey)

      if (data != null) {
        let playedEpData = null
        try {
          playedEpData = JSON.parse(data)
          for (const id in playedEpData) {
            if (playedEpData[id] === null) {
              playedEpData[id] = await getClientInfo(`${podcast.id}-${id}`)
            }
          }


        } catch (ex) {
          console.log(ex)
          playedEpData = {}
          await deleteClientInfo(playedEpisodesKey)
        }
        setPlayedEpisode(playedEpData)
      }
  }, [])


  let searchedEpisodes;
  if (searchText !== "") {
    searchedEpisodes = episodes.search(searchText);
  } else {
    searchedEpisodes = episodes.getIndex().docs.map((item) => ({ item, matches: [], score: 1 }));
  }

  searchedEpisodes = searchedEpisodes.map(x => x.item).map(x => {
    const lengthPlayed = playedEpisodes[x.id]
    if (lengthPlayed === undefined) {
      x.percentPlayed = 0
    } else {
      if (x.audio_length_sec !== 0) {
        x.percentPlayed = Math.round(lengthPlayed / x.audio_length_sec * 100)
      } else {
        x.percentPlayed = 0
      }
    }

    return x
  })


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
          <InfiniteScroll items={searchedEpisodes} pad="small">
            {(episode) => (
              <Link to="/podcast/play" 
              state={{ podcast: podcast, episode: episode, episodes: searchedEpisodes }} 
              style={{ textDecoration: 'none' }}
              onClick={() => {
                const newPlayed = {...playedEpisodes}
                newPlayed[episode.id] = null
                setPlayedEpisode(newPlayed)
                setClientInfo(playedEpisodesKey, JSON.stringify(newPlayed))
              }}  >
                <Box key={episode.id} align="center" justify="between" 
                fill="horizontal" direction="row-responsive"
                margin={{top: "xxsmall"}}
                background={`linear-gradient(to right, ${theme.global.colors['grey!']} ${episode.percentPlayed}% , ${theme.global.colors['dark-2']}  ${episode.percentPlayed}% 100%)`}>

                  <Box align="center" justify="start" direction="row">
                        <Button icon={<Play />} size="large"/>
                    <Box align="start" justify="start" direction="column" >
                      <Text color="text">
                        {episode.name}
                      </Text>
                    </Box>
                  </Box>

                  <Box align="end" justify="end" direction="column">
                    <Text color="text-weak">
                      {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
                    </Text>
                  </Box>
                </Box>
              </Link>
            )}
          </InfiniteScroll>
        </Box>


      </Box>

    </Grommet>
  )
}