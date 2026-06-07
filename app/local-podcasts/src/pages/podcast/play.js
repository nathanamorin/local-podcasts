import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Box, Heading, Paragraph, Button, Text } from 'grommet'
import { Previous, Play, Add } from 'grommet-icons'
import { background, cardBackground, theme } from '../theme'
import { usePlayer } from '../../PlayerContext'


export function PlayPodcast() {
  const location = useLocation()
  const navigate = useNavigate()
  const { podcastId, episodeId } = useParams()
  const { currentEpisode, playNow, addToQueue } = usePlayer()

  const [episode, setEpisode] = useState(null)
  const [podcast, setPodcast] = useState(null)

  useEffect(async () => {
    if (location.state?.episode && location.state?.podcast) {
      setPodcast(location.state.podcast)
      setEpisode(location.state.episode)
      return
    }

    fetch(`/podcasts/${podcastId}`)
      .then(res => res.json())
      .then(data => {
        setPodcast(data)
        const eps = data.episodes || []
        const ep = eps.find(e => e.id === episodeId)
        if (ep) {
          setEpisode(ep)
        } else {
          window.location.href = '/'
        }
      })
      .catch(() => { window.location.href = '/' })
  }, [])

  if (!episode || !podcast) {
    return (
      <Box fill background={background} />
    )
  }

  const isThisPlaying = currentEpisode?.id === episode.id

  return (
    // Outer: full height column, background fills viewport
    <Box
      fill
      direction="column"
      background={background}
    >
      {/* Back button row */}
      <Box
        flex={{ shrink: 0 }}
        pad={{ horizontal: 'small', vertical: 'xsmall' }}
        direction="row"
        align="center"
      >
        <Button onClick={() => navigate(-1)} icon={<Previous />} />
      </Box>

      {/* Card fills all remaining vertical space */}
      <Box
        flex
        overflow="hidden"
        margin={{ horizontal: 'medium', bottom: 'medium' }}
        background={cardBackground}
        round="medium"
        direction="column"
        animation={{ type: 'fadeIn', size: 'medium' }}
      >
        {/* Scrollable content area */}
        <Box flex overflow={{ vertical: 'auto' }} align="center" pad="medium">
          {/* Podcast artwork */}
          <Box
            width="180px"
            height="180px"
            flex={{ shrink: 0 }}
            round="small"
            margin={{ bottom: 'medium' }}
            background={{
              dark: false,
              color: 'light-2',
              image: `url('/podcasts/${podcast.id}/image')`,
              size: 'cover',
            }}
          />

          <Heading level="2" size="small" margin={{ top: 'none', bottom: 'xsmall' }} textAlign="center">
            {podcast.name}
          </Heading>
          <Heading level="3" size="medium" margin={{ top: 'none', bottom: 'xsmall' }} textAlign="center">
            {episode.name}
          </Heading>
          <Text size="xsmall" color="text-weak" margin={{ bottom: 'medium' }}>
            {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
          </Text>

          <Paragraph size="small" textAlign="center" fill>
            {episode.description.replace(/(<([^>]+)>)/gi, '')}
          </Paragraph>
        </Box>

        {/* Action buttons pinned to bottom of card */}
        <Box
          flex={{ shrink: 0 }}
          border={{ side: 'top', color: 'border', size: 'xsmall' }}
          pad={{ horizontal: 'medium', vertical: 'small' }}
          direction="row"
          justify="center"
          gap="small"
        >
          {isThisPlaying ? (
            <Text size="small" color="text-weak">▶ Now playing</Text>
          ) : (
            <>
              <Button
                primary
                icon={<Play />}
                label={currentEpisode ? 'Play Now' : 'Play'}
                onClick={() => playNow(podcast, episode)}
              />
              {currentEpisode && (
                <Button
                  icon={<Add />}
                  label="Add to Queue"
                  onClick={() => addToQueue(podcast, episode)}
                />
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
