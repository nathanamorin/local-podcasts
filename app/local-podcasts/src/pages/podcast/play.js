import { useContext, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Box, Heading, Paragraph, Button, Text, ResponsiveContext } from 'grommet'
import { Play, Add } from 'grommet-icons'
import { Link } from 'react-router-dom'
import { Header } from '../../components/Header'
import { usePlayer } from '../../PlayerContext'

// Formats a millisecond offset as m:ss (or h:mm:ss for long episodes).
function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function PlayPodcast() {
  const location = useLocation()
  const { podcastId, episodeId } = useParams()
  const { currentEpisode, playNow, addToQueue, seekTo, canSeek } = usePlayer()
  const size = useContext(ResponsiveContext)
  const compact = size === 'small'

  const [episode, setEpisode] = useState(null)
  const [podcast, setPodcast] = useState(null)
  // undefined = still loading, null = no transcript available, object = loaded
  const [transcript, setTranscript] = useState(undefined)

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
        return fetch(`/podcasts/${podcastId}/episodes/${episodeId}`)
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`episode fetch failed: ${res.status}`)
        }
        return res.json()
      })
      .then(ep => setEpisode(ep))
      .catch(() => { window.location.href = '/' })
  }, [])

  // Transcription happens asynchronously in the background and may not
  // have run yet for this episode, so a 404 here just means "not available
  // yet" rather than an error - render nothing instead of failing.
  useEffect(() => {
    setTranscript(undefined)
    let cancelled = false
    fetch(`/podcasts/${podcastId}/episodes/${episodeId}/transcript`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) setTranscript(data) })
      .catch(() => { if (!cancelled) setTranscript(null) })
    return () => { cancelled = true }
  }, [podcastId, episodeId])

  if (!episode || !podcast) {
    return <Box fill />
  }

  const isThisPlaying = currentEpisode?.id === episode.id

  return (
    <Box fill>
      <Header title={episode.name} back={`/podcast/${podcastId}`} />

        <Box
          direction={compact ? 'column' : 'row'}
          gap="large"
          pad="medium"
          flex="grow"
          overflow="auto"
          style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}
        >
          {/* Left: artwork + metadata + actions, sticky on desktop */}
          <Box
            align={compact ? 'center' : 'start'}
            gap="small"
            flex={{ shrink: 0 }}
            width={compact ? undefined : '300px'}
            style={compact ? undefined : { position: 'sticky', top: '76px', alignSelf: 'start' }}
          >
            <Box
              width="220px"
              height="220px"
              round="small"
              background={{ color: 'background-contrast', image: `url('/podcasts/${podcast.id}/image')`, size: 'cover' }}
            />
            <Heading level="3" margin="none" textAlign={compact ? 'center' : 'start'}>
              {episode.name}
            </Heading>
            <Link to={`/podcast/${podcast.id}`} style={{ textDecoration: 'none' }}>
              <Text size="small" color="text-weak">{podcast.name}</Text>
            </Link>
            <Text size="xsmall" color="text-xweak">
              {(new Date(episode.publish_timestamp * 1000)).toLocaleDateString()}
            </Text>

            <Box direction="row" gap="small" margin={{ top: 'small' }} wrap>
              {isThisPlaying ? (
                <Text size="small" color="accent-1">▶ Now playing</Text>
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
                      label="Queue"
                      onClick={() => addToQueue(podcast, episode)}
                    />
                  )}
                </>
              )}
            </Box>
          </Box>

          {/* Right: description + transcript */}
          <Box flex gap="medium" style={{ minWidth: 0 }}>
            <Paragraph size="small" color="text-weak" fill style={{ maxWidth: 'none' }}>
              {episode.description.replace(/(<([^>]+)>)/gi, '')}
            </Paragraph>

            {transcript && transcript.segments?.length > 0 && (
              <Box gap="small">
                <Heading level="4" margin="none">Transcript</Heading>
                <Box gap="2px">
                  {transcript.segments.map(seg => (
                    <Box
                      key={seg.index}
                      direction="row"
                      gap="small"
                      pad="xsmall"
                      round="xsmall"
                      hoverIndicator={isThisPlaying && canSeek ? 'background-contrast' : undefined}
                      onClick={isThisPlaying && canSeek ? () => seekTo(seg.start_ms / 1000) : undefined}
                      style={isThisPlaying && canSeek ? { cursor: 'pointer' } : undefined}
                      title={isThisPlaying && canSeek ? 'Jump to this point in the episode' : undefined}
                    >
                      <Text size="xsmall" color="text-weak" style={{ flexShrink: 0, minWidth: '3em', fontVariantNumeric: 'tabular-nums' }}>
                        {formatTimestamp(seg.start_ms)}
                      </Text>
                      <Text size="small">{seg.text}</Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
  )
}
