import { Box, Button, Layer, Text, Heading } from 'grommet'
import { Close, Up, Down, Trash } from 'grommet-icons'
import { usePlayer } from '../PlayerContext'
import { cardBackground } from '../pages/theme'

export function QueueDrawer() {
  const {
    currentPodcast,
    currentEpisode,
    queue,
    showQueue,
    setShowQueue,
    removeFromQueue,
    moveUp,
    moveDown,
    playNow,
  } = usePlayer()

  if (!showQueue) return null

  return (
    <Layer
      position="right"
      full="vertical"
      onClickOutside={() => setShowQueue(false)}
      onEsc={() => setShowQueue(false)}
      animate
    >
      <Box
        width="360px"
        fill="vertical"
        background={cardBackground}
        overflow="auto"
      >
        {/* Header */}
        <Box
          direction="row"
          align="center"
          justify="between"
          pad={{ horizontal: 'medium', vertical: 'small' }}
          border={{ side: 'bottom', color: 'border' }}
          flex={{ shrink: 0 }}
        >
          <Heading level="4" margin="none">Play Queue</Heading>
          <Button icon={<Close />} onClick={() => setShowQueue(false)} plain />
        </Box>

        {/* Now playing */}
        {currentEpisode && (
          <Box pad={{ horizontal: 'medium', top: 'small', bottom: 'xsmall' }}>
            <Text size="xsmall" color="text-xweak" weight="bold" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Now Playing
            </Text>
            <Box
              pad="small"
              round="xsmall"
              background="background-front"
              margin={{ top: 'xsmall' }}
              direction="row"
              align="center"
              gap="small"
            >
              <Box
                width="36px"
                height="36px"
                round="xsmall"
                flex={{ shrink: 0 }}
                background={{
                  color: 'light-2',
                  image: `url('/podcasts/${currentPodcast.id}/image')`,
                  size: 'cover',
                }}
              />
              <Box flex overflow="hidden">
                <Text size="small" color="text" weight="bold" truncate>
                  {currentEpisode.name}
                </Text>
                <Text size="xsmall" color="text-weak" truncate>
                  {currentPodcast.name}
                </Text>
              </Box>
            </Box>
          </Box>
        )}

        {/* Queue */}
        <Box pad={{ horizontal: 'medium', top: 'small' }} flex={{ shrink: 0 }}>
          <Text size="xsmall" color="text-xweak" weight="bold" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Up Next {queue.length > 0 ? `(${queue.length})` : ''}
          </Text>
        </Box>

        {queue.length === 0 ? (
          <Box pad="medium" align="center">
            <Text size="small" color="text-weak">Queue is empty</Text>
          </Box>
        ) : (
          <Box overflow="auto" flex>
            {queue.map(({ podcast, episode }, idx) => (
              <Box
                key={`${podcast.id}-${episode.id}-${idx}`}
                direction="row"
                align="center"
                justify="between"
                pad={{ horizontal: 'medium', vertical: 'xsmall' }}
                border={{ side: 'bottom', color: 'border', size: 'xsmall' }}
                hoverIndicator="background-front"
              >
                {/* Episode info — click to play now */}
                <Box
                  direction="row"
                  align="center"
                  gap="small"
                  flex
                  overflow="hidden"
                  onClick={() => {
                    playNow(podcast, episode)
                    removeFromQueue(idx)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <Box
                    width="32px"
                    height="32px"
                    round="xsmall"
                    flex={{ shrink: 0 }}
                    background={{
                      color: 'light-2',
                      image: `url('/podcasts/${podcast.id}/image')`,
                      size: 'cover',
                    }}
                  />
                  <Box flex overflow="hidden">
                    <Text size="small" color="text" truncate>{episode.name}</Text>
                    <Text size="xsmall" color="text-weak" truncate>{podcast.name}</Text>
                  </Box>
                </Box>

                {/* Controls */}
                <Box direction="row" align="center" flex={{ shrink: 0 }}>
                  <Button
                    icon={<Up size="small" />}
                    plain
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    tip="Move up"
                  />
                  <Button
                    icon={<Down size="small" />}
                    plain
                    onClick={() => moveDown(idx)}
                    disabled={idx === queue.length - 1}
                    tip="Move down"
                  />
                  <Button
                    icon={<Trash size="small" />}
                    plain
                    onClick={() => removeFromQueue(idx)}
                    tip="Remove from queue"
                  />
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Layer>
  )
}
