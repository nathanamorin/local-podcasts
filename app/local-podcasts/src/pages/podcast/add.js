import React, { useState, useEffect } from 'react'
import { Grommet,Box, List, Button, TextInput, Heading, Paragraph } from 'grommet'
import { Play } from 'grommet-icons'
import { Link, useLocation } from "react-router-dom";
const theme = {
    "global": {
      "colors": {
        "background": {
          "light": "#ffffff",
          "dark": "#000000"
        }
      },
      "font": {
        "family": "-apple-system,\n         BlinkMacSystemFont, \n         \"Segoe UI\", \n         Roboto, \n         Oxygen, \n         Ubuntu, \n         Cantarell, \n         \"Fira Sans\", \n         \"Droid Sans\",  \n         \"Helvetica Neue\", \n         Arial, sans-serif,  \n         \"Apple Color Emoji\", \n         \"Segoe UI Emoji\", \n         \"Segoe UI Symbol\""
      }
    },
    "button": {
      "extend": [
        null
      ]
    }
  }


export function AddPodcast () {

    const [value, setValue] = React.useState('');

    return (
        <Grommet full theme={theme}>
          <Box fill="vertical" overflow="auto" align="center" flex="grow" pad="medium">
          <TextInput placeholder="RSS URL" value={value}  onChange={event => setValue(event.target.value)}/>
            <Box align="center" justify="center" pad="medium">
              <Button label="Submit" onClick={() => {
                    fetch(`/podcasts`, {
                        method: 'POST',
                        body: JSON.stringify({rss_url: value})
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