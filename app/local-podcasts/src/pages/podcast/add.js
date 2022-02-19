import React from 'react'
import { useNavigate } from "react-router-dom"
import { Grommet, Box, Button, TextInput } from 'grommet'
import { Previous } from 'grommet-icons'
import { theme } from '../theme'


export function AddPodcast() {

  const navigate = useNavigate()

  const [value, setValue] = React.useState('');

  return (
    <Grommet full theme={theme}>
      <Box fill="vertical" overflow="auto" align="center" flex="grow" pad="medium">
      <Box justify="center" align="start" justify="between" fill="horizontal" direction="row">
          <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />}/>
        </Box>
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