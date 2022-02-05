import React from 'react'
import { Grommet, Box, Button, TextInput } from 'grommet'
import { theme } from '../theme'


export function AddPodcast() {

  const [value, setValue] = React.useState('');

  return (
    <Grommet full theme={theme}>
      <Box fill="vertical" overflow="auto" align="center" flex="grow" pad="medium">
        <TextInput placeholder="RSS URL" value={value} onChange={event => setValue(event.target.value)} />
        <Box align="center" justify="center" pad="medium">
          <Button label="Submit" onClick={() => {
            fetch(`/podcasts`, {
              method: 'POST',
              body: JSON.stringify({ rss_url: value })
            })
              .then(data => {
                window.location.href = "/"
              })
              .catch(err => {
                alert(err)
              })
          }} />
        </Box>
      </Box>
    </Grommet>
  )
}