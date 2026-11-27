import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Box, Heading, Paragraph, Button, Text } from 'grommet'
import { Previous, Play, Add } from 'grommet-icons'
import { background, cardBackground, theme } from '../theme'
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
  const navigate = useNavigate()
  const { podcastId, episodeId } = useParams()
  const { currentEpisode, playNow, addToQueue, seekTo, canSeek } = usePlayer()

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

          {transcript && transcript.segments?.length > 0 && (
            <Box fill="horizontal" margin={{ top: 'medium' }}>
              <Heading level="4" size="small" margin={{ top: 'none', bottom: 'xsmall' }}>
                Transcript
              </Heading>
              <Box gap="xsmall">
                {transcript.segments.map(seg => (
                  <Box
                    key={seg.index}
                    direction="row"
                    gap="small"
                    pad="xsmall"
                    round="xsmall"
                    onClick={isThisPlaying && canSeek ? () => seekTo(seg.start_ms / 1000) : undefined}
                    style={isThisPlaying && canSeek ? { cursor: 'pointer' } : undefined}
                    title={isThisPlaying && canSeek ? 'Jump to this point in the episode' : undefined}
                  >
                    <Text size="xsmall" color="text-weak" style={{ flexShrink: 0, minWidth: '3em' }}>
                      {formatTimestamp(seg.start_ms)}
                    </Text>
                    <Text size="small">{seg.text}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
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
