import React from 'react'
import { useNavigate } from "react-router-dom"
import { Box, Button, Heading, Text, TextInput } from 'grommet'
import { Header } from '../../components/Header'


export function AddPodcast() {

  const navigate = useNavigate()

  const [value, setValue] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)

  function submit() {
    if (!value.trim()) return
    setSubmitting(true)
    setError(null)
    fetch(`/podcasts`, {
      method: 'POST',
      body: JSON.stringify({ rss_url: value }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Could not add that podcast — check the RSS URL and try again.')
        navigate('/')
      })
      .catch(err => {
        setSubmitting(false)
        setError(err.message)
      })
  }

  return (
    <Box fill>
      <Header title="Add Podcast" />
      <Box align="center" pad="large">
        <Box gap="small" width={{ max: '420px' }} fill="horizontal">
          <Heading level="3" margin="none">Add a podcast</Heading>
          <Text size="small" color="text-weak">
            Paste the podcast's RSS feed URL to subscribe.
          </Text>
          <TextInput
            placeholder="https://example.com/feed.xml"
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          {error && <Text size="small" color="status-critical">{error}</Text>}
          <Button
            primary
            label={submitting ? 'Adding…' : 'Add Podcast'}
            disabled={submitting || !value.trim()}
            onClick={submit}
          />
        </Box>
      </Box>
    </Box>
  )
}
