import React from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, Heading, Text } from 'grommet'

export default function NotFound() {
  return (
    <Box fill align="center" justify="center" gap="small" pad="large">
      <Heading level="1" margin="none">404</Heading>
      <Text color="text-weak">We couldn't find that page.</Text>
      <Link to="/">
        <Button label="Back to podcasts" primary margin={{ top: 'small' }} />
      </Link>
    </Box>
  )
}
