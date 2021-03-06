import React, { useState, useEffect } from 'react'
import { Grommet, Box, Button, TextInput } from 'grommet'
import { Previous } from 'grommet-icons'
import { useNavigate } from "react-router-dom"
import { theme } from './theme'
import { setClientToken, getClientToken, deleteClientToken } from './utils'
import { Html5QrcodePlugin } from './qr-code'
import QRCode from 'react-qr-code'


export function UserInfo() {
  const navigate = useNavigate()

  const [currentClientToken, setCurrentClientToken] = useState("")
  const [isReading, setIsReading] = useState(false)

  useEffect(() => {
    setCurrentClientToken(getClientToken())
  }, [])


  let reader = null
  if (isReading) {
    reader = <Html5QrcodePlugin 
      fps={10}
      qrbox={250}
      disableFlip={false}
      qrCodeSuccessCallback={(decodedText, decodedResult) => {
        setCurrentClientToken(decodedText)
        setIsReading(false)
      }}/>
  }

  return (
    <Grommet full theme={theme}>
      <Box fill="vertical" overflow="auto" align="center" flex="grow" pad="medium">
        <Box justify="center" align="start" justify="between" fill="horizontal" direction="row">
          <Button onClick={() => navigate(-1)} justify="start" icon={<Previous />}/>
        </Box>
        <Box pad="small">
          <QRCode value={currentClientToken} pad="small" />
        </Box>
        <TextInput placeholder="User Token" value={currentClientToken} onChange={event => setCurrentClientToken(event.target.value)} />
        <Box align="center" justify="center" pad={{}} direction='row'>
          
          <Button label="Scan User Token" onClick={() => {
            setIsReading(!isReading)
          }} margin="medium"/>

          <Button label="Save User Token" onClick={() => {
            setClientToken(currentClientToken)
          }} margin="medium"/>

          <Button label="Clear User Token" onClick={() => {
            deleteClientToken()
          }} margin="medium"/>
        </Box>
        <Box fill="horizontal" >
          {reader}
        </Box>
      </Box>
    </Grommet>
  )
}