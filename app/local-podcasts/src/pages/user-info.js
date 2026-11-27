import React, { useState, useEffect } from 'react'
import { Box, Text, Avatar } from 'grommet'
import { User } from 'grommet-icons'
import { Header } from '../components/Header'

// Identity and favorites are fully managed by Istio/Pocket ID SSO now
// (X-Auth-Request-User), so this page is just a read-only account summary —
// the manual per-device QR-code pairing flow it used to offer is gone,
// since there's no longer a separate identity to pair across devices.
export function UserInfo() {
  const [signedInUser, setSignedInUser] = useState(null)

  useEffect(() => {
    fetch('/me')
      .then(r => r.json())
      .then(data => setSignedInUser(data.user_id))
      .catch(() => setSignedInUser(null))
  }, [])

  return (
    <Box fill>
        <Header title="Account" />
        <Box align="center" pad="large" gap="small">
          <Avatar background="background-contrast" size="large">
            <User color="text-weak" />
          </Avatar>
          {signedInUser ? (
            <Text color="text">Signed in as <strong>{signedInUser}</strong></Text>
          ) : (
            <Text color="text-weak">Not signed in</Text>
          )}
          <Text size="small" color="text-weak" textAlign="center" style={{ maxWidth: '360px' }}>
            Favorites follow this account across every device you sign in on.
          </Text>
        </Box>
    </Box>
  )
}
