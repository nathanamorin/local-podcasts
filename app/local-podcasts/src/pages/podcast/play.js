import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom';
import { Grommet,Box, Heading, Paragraph } from 'grommet'

import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

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


export function PlayPodcast() {
    const location = useLocation()


    const [state, setState] = useState({podcast: {}, episode: {description: ""}})  

    useEffect(() => {
        // Handle preserving state
        let podcastId = null
        let episodeId = null
        let podcast = null
        let episode = null

        
        if (location.state !== null && location.state.episode !== null) {
            episode = location.state.episode
            localStorage.setItem('currentEpisode', location.state.episode.id)
            episodeId = location.state.episode.id
        } else {
            episodeId = localStorage.getItem('currentEpisode')

            if (episodeId === null) {
                window.location.href = "/"
                return
            }
        }


        if (location.state !== null && location.state.podcast !== null) {
            podcast = location.state.podcast
            console.log("not something")
            localStorage.setItem('currentPodcast', location.state.podcast.id)
            podcastId = location.state.podcast.id
        } else {
          podcastId = localStorage.getItem('currentPodcast')

          if (podcastId === null) {
              window.location.href = "/"
              return
          }
        }

        if (episode !== null && podcast !== null) {
            setState({podcast: podcast, episode: episode})
            return
        } else {
      
            fetch(`/podcasts/${podcastId}`)
            .then(data => data.json())
            .then(data => {
                podcast = data
                let found = false
                data.episodes.forEach(e => {
                    if (e.id === episodeId) {
                        episode = e
                        found = true
                    }
                })

                if (!found) {
                    localStorage.removeItem('currentPodcast')
                    localStorage.removeItem('currentEpisode')
                    window.location.href = "/"
                    return
                }

                setState({podcast: podcast, episode: episode})
            })
            .catch(err => {
              console.log(err)
              localStorage.removeItem('currentPodcast')
              localStorage.removeItem('currentEpisode')
            })
        }

    }, [location])
    
    const podcast = state.podcast
    const episode = state.episode


    if (podcast.id === null) {
        return (<Grommet full theme={theme}>
        <Box align="start" justify="center" pad="small" background={{"color":"dark-2","image":"url('')"}} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto"/>
        </Grommet>)
    }


    let startTime = localStorage.getItem(`${podcast.id}/${episode.id}`)
    if (startTime === undefined) {
        startTime = 0
    }


    const audioPlayer = <AudioPlayer
                            autoPlay
                            src={`/podcasts/${podcast.id}/episodes/${episode.id}/stream`}
                            onListen={e => {
                                const time = e.target.currentTime
                                console.log(time)
                                localStorage.setItem(`${podcast.id}/${episode.id}`, time)
                            }}
                            onLoadedMetaData={e => {
                                console.log("loaded metadata")
                                e.target.currentTime = startTime
                            }}
                            customAdditionalControls={[]}
                        />

  

    return (
        
      <Grommet full theme={theme}>
        <Box align="start" justify="center" pad="small" background={{"color":"dark-2","image":"url('')"}} height="xlarge" flex={false} fill="vertical" direction="row" wrap overflow="auto">

<Box align="center" pad="small" background={{"0":"b","1":"r","2":"a","3":"n","4":"d","color":"white","image":"url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"130\" height=\"192\" viewBox=\"24 0 140 192\">\n  <g fill=\"none\" fill-rule=\"evenodd\">\n    <path stroke=\"#DADADA\" d=\"M73 19L73 12 75.5 12 76.5 10 80.5 10 81.5 12 84 12 84 19 73 19zM78.5 17.5C79.8807119 17.5 81 16.3807119 81 15 81 13.6192881 79.8807119 12.5 78.5 12.5 77.1192881 12.5 76 13.6192881 76 15 76 16.3807119 77.1192881 17.5 78.5 17.5zM150 20C152.761424 20 155 17.7614237 155 15 155 12.2385763 152.761424 10 150 10 147.238576 10 145 12.2385763 145 15 145 17.7614237 147.238576 20 150 20zM151.5 17C151.5 16.1715729 150.828427 15.5 150 15.5 149.171573 15.5 148.5 16.1715729 148.5 17M146.5 11.5L147.5 12.5M150 12.5L150 15.5M150 10.5L150 11.5M153.5 15L154.5 15M145.5 15L146.5 15M152.5 12.5L153.5 11.5M145.5 17.5L154.5 17.5M45 37.0001041C45 35.4999416 47 34.5002148 47 32.5000456 47 30.4998764 45.5 29 43.5 29 41.5 29 40 30.4998764 40 32.5000456 40 34.5002148 42 35.4999416 42 37.0001041 42 38.5002667 42 38.4999805 42 38.4999805 42 39.4999936 42.5 39.9999999 43.5 40 44.5 40.0000001 45 39.4999936 45 38.4999805 45 38.4999805 45 38.5002667 45 37.0001041zM42 37.4999675L45 37.4999675M71.5 29L71.5 32.5001023 68 38.5000205 68 40 78 40 78 38.5000205 74.5 32.5001023 74.5 29M74.50015 37.4998841C74.7762924 37.4998841 75.00015 37.2760295 75.00015 36.9998909 75.00015 36.7237523 74.7762924 36.4998977 74.50015 36.4998977 74.2240076 36.4998977 74.00015 36.7237523 74.00015 36.9998909 74.00015 37.2760295 74.2240076 37.4998841 74.50015 37.4998841zM71.50015 38.4998705C71.7762924 38.4998705 72.00015 38.2760159 72.00015 37.9998773 72.00015 37.7237387 71.7762924 37.4998841 71.50015 37.4998841 71.2240076 37.4998841 71.00015 37.7237387 71.00015 37.9998773 71.00015 38.2760159 71.2240076 38.4998705 71.50015 38.4998705zM76.00015 34.9999182C72.50015 33.4999386 73.00015 36.999891 70.00015 35.4999114M70 29.00015L76 29.00015M142.982321 29.0176786C142.982321 29.0176786 139.568321 28.7780062 138.275612 30.063614 138.263438 30.0828892 136.183741 32.1554847 136.183741 32.1554847L133.568903 32.6784524 132 33.7243878 136.183741 35.8162585 138.275612 40 139.321548 38.4310969 139.844515 35.8162585C139.844515 35.8162585 141.917111 33.7365617 141.936386 33.7243878 143.221994 32.4316787 142.982321 29.0176786 142.982321 29.0176786zM139.844515 32.6784524C139.555576 32.6784524 139.321548 32.4444244 139.321548 32.1554847 139.321548 31.8665451 139.555576 31.632517 139.844515 31.632517 140.133455 31.632517 140.367483 31.8665451 140.367483 32.1554847 140.367483 32.4444244 140.133455 32.6784524 139.844515 32.6784524zM134.614838 37.3851616C134.091871 36.8621939 133.045935 36.8621939 132.522968 37.3851616 132 37.9081293 132 40 132 40 132 40 134.091871 40 134.614838 39.4770323 135.137806 38.9540646 135.137806 37.9081293 134.614838 37.3851616zM14 36.5L14 32M14.0000001 34C14 32.5 14 31 10.5 31 10.5 32.5 10.5 34 14.0000001 34zM10 36.5L18 36.5M17 36.5L16 40 12 40 11 36.5 11 36.5M14 32C14 30.5 14 29 17.5 29 17.5 30.5 17.5 32 14 32zM167.25 40C168.492641 40 169.5 38.9396218 169.5 37.6315789 169.5 36.3235361 168.492641 35.2631579 167.25 35.2631579 166.007359 35.2631579 165 36.3235361 165 37.6315789 165 38.9396218 166.007359 40 167.25 40zM165 37.3684211L165 32.6315789 165 32.3684211C165 31.0603782 166.007359 30 167.25 30L167.5 30M176 37.3684211L176 32.6315789 176 32.3684211C176 31.0603782 174.992641 30 173.75 30L173.5 30M173.75 40C174.992641 40 176 38.9396218 176 37.6315789 176 36.3235361 174.992641 35.2631579 173.75 35.2631579 172.507359 35.2631579 171.5 36.3235361 171.5 37.6315789 171.5 38.9396218 172.507359 40 173.75 40zM169.5 37.8947368C169.5 37.8947368 169.5 36.8421053 170.5 36.8421053 171.5 36.8421053 171.5 37.8947368 171.5 37.8947368\"/>\n    <path stroke=\"#DADADA\" stroke-linecap=\"round\" d=\"M147.65975,78 C147.65975,77.4477153 147.201031,77 146.635173,77 C146.069315,77 145.610596,77.4477153 145.610596,78 C145.610596,78.5522847 146.069315,79 146.635173,79 L146.635173,79 M146.635173,80.5 C145.220527,80.5 144.073731,79.3807119 144.073731,78 C144.073731,76.6192881 145.220527,75.5 146.635173,75.5 C148.049818,75.5 149.196615,76.6192881 149.196615,78 C149.196615,78.4142136 149.540654,78.75 149.965048,78.75 C150.389441,78.75 150.73348,78.4142136 150.73348,78 C150.73348,75.790861 148.898606,74 146.635173,74 C144.37174,74 142.536865,75.790861 142.536865,78 C142.536865,80.209139 144.37174,82 146.635173,82 L147.65975,82 M141,78 C141,79.3360399 141.488086,80.5608157 142.29972,81.5137359 M151,74.5210393 C149.966613,73.287443 148.395112,72.5 146.635173,72.5 C144.891562,72.5 143.332908,73.2728999 142.299246,74.486821 M149.978319,71.8054151 C148.980064,71.2911423 147.842454,71 146.635173,71 C145.437065,71 144.307574,71.2867346 143.314807,71.7937307\"/>\n    <path stroke=\"#DADADA\" d=\"M49 10L39 14 48.25 18 49 10zM43 18.75L44.5 16.5M45.75 13.25L42.5 15.5 42.8580575 18.0064025C42.9364502 18.5551512 43.0737767 18.5573397 43.1637187 18.0176878L43.5 16 45.75 13.25zM121 53L129 53 129 62 121 62 121 53zM121 53L129 53 129 52C129 51.4477153 128.546964 51 128.00297 51L121.99703 51C121.446386 51 121 51.4438648 121 52L121 53zM118 54.998576C118 54.1709353 118.665797 53.5 119.5 53.5L121 53.5 121 59.5 119.5 59.5C118.671573 59.5 118 58.8349702 118 58.001424L118 54.998576zM123 54.5L123 59.5M125 54.5L125 59.5M127 54.5L127 59.5M99.5 71L99.5 73.7486574C99.5 74.9920396 98.5013041 76 97.25 76L97.25 76C96.0073593 76 95 74.9881754 95 73.7486574L95 71M96.5 74C96.5 74 96.5 73.7842474 96.5 73.504611L96.5 71M98 74C98 74 98 73.7842474 98 73.504611L98 71M96.5 76L96.5 81.2400959C96.5 81.6597793 96.8328986 82 97.25 82L97.25 82C97.6642136 82 98 81.6602228 98 81.2400959L98 76M101 79.5L101 81.2499176C101 81.6641767 101.332899 82 101.75 82L101.75 82C102.164214 82 102.5 81.6658422 102.5 81.2476306L102.5 78C102.5 78 104 78 104 76.5 104 75 104 75.5 104 74 104 72.5 103 71.5 101 71.5 101 71.5 101 75.4972807 101 79.5L101 79.5zM41 88.5C41 87.6715729 41.6785455 87 42.5008327 87L45 87 45 88.5C45 89.3284271 44.3214545 90 43.4991673 90L42.5008327 90C41.6719457 90 41 89.3342028 41 88.5L41 88.5zM48 88.5C48 87.6715729 48.6785455 87 49.5008327 87L52 87 52 88.5C52 89.3284271 51.3214545 90 50.4991673 90L49.5008327 90C48.6719457 90 48 89.3342028 48 88.5L48 88.5zM45 87L45 80 52 80 52 86.75M45 82L52 82\"/>\n    <path stroke=\"#DADADA\" d=\"M114.5,17.5 L114.5,12.5 L114.5,17.5 Z M114.5,20 C117.537566,20 120,17.5375661 120,14.5 C120,11.4624339 117.537566,9 114.5,9 C111.462434,9 109,11.4624339 109,14.5 C109,17.5375661 111.462434,20 114.5,20 Z M117,14.5 L114.5,12 L112,14.5\" transform=\"matrix(1 0 0 -1 0 29)\"/>\n    <path stroke=\"#DADADA\" d=\"M31 57.7826087C31.2761424 57.7826087 31.5 57.5490181 31.5 57.2608696 31.5 56.972721 31.2761424 56.7391304 31 56.7391304 30.7238576 56.7391304 30.5 56.972721 30.5 57.2608696 30.5 57.5490181 30.7238576 57.7826087 31 57.7826087zM36 57.7826087C36.2761424 57.7826087 36.5 57.5490181 36.5 57.2608696 36.5 56.972721 36.2761424 56.7391304 36 56.7391304 35.7238576 56.7391304 35.5 56.972721 35.5 57.2608696 35.5 57.5490181 35.7238576 57.7826087 36 57.7826087zM33.5 58.826087C33.75 58.826087 34 58.6586205 34 58.3043478 34 58.2454599 33 58.2650168 33 58.3043478 33 58.6586205 33.25 58.826087 33.5 58.826087zM29 63C29 63 29.0017057 58.826087 29 56.7391304 29.0017057 54.6521739 28.7765468 52.5652174 33.5 52.5652174 38.2234532 52.5652174 37.9982943 54.6521739 38 56.7391304 37.9982943 58.826087 38 63 38 63M37.534109 54.1304348C39.1636114 54.1304348 39.3239028 52.2628239 38.5568483 51.4624192 37.7897938 50.6620145 36 50.8292751 36 52.5296254M31 60.3913043C31 60.2851965 32.2500001 60.9922354 33.5 60.9130435 34.7499999 60.9922355 36 60.1311503 36 60.3913043 36 60.8098425 35.25 61.4347826 33.5 61.4347826 31.75 61.4347826 31 60.6557961 31 60.3913043zM29.4723215 54.1304348C27.8022035 54.1304348 27.6900299 52.2628239 28.4538691 51.4624192 29.2177084 50.6620145 31 50.8292751 31 52.5296254M3 12.7C3 10.5 4.75 10 5.75 10 7 10 8 11 8.5 11.75 9 11 10 10 11.25 10 12.25 10 14 10.5 14 12.7 14 16 8.5 19 8.5 19 8.5 19 3 16 3 12.7zM181.261353 10C180.551835 10 179.519808 10.7615701 179.261802 11.2692834 178.893056 11.9949123 178.953916 12.2799781 179.1973 13.0462802 179.519808 14.061707 180.465373 15.8616098 181.777367 17.1079872 183.647915 18.884984 185.38946 19.6465541 186.16348 19.9004108 186.9375 20.1542675 187.776022 19.9004108 188.292036 19.3926974 188.808049 18.884984 189.324062 18.3772707 188.743547 17.6157006 188.332184 17.0760385 187.732926 16.4521441 187.002002 16.0925605 186.337385 15.7655972 185.941299 15.8846104 185.711969 16.3464172 185.585191 16.6017108 185.545814 17.0907187 185.453962 17.3618439 185.338077 17.7039067 184.873447 17.6157006 184.357434 17.3618439 183.863414 17.1188075 182.615888 16.0925605 181.583862 14.5694204 180.944452 13.6257324 181.966489 13.6196139 182.615888 13.3001369 183.131902 13.0462802 183.291861 12.4624021 182.873895 11.7769968 182.099875 10.5077134 181.841868 10 181.261353 10zM64 54.5C62.5 54.5 61.4166667 54.5 60.75 54.5 59.75 54.5 59 53.75 59 52.75 59 51.75 59.75 51 60.75 51 61.75 51 62.5 51.75 62.5 52.75 62.5 53.4166667 62.5 54.5 62.5 56 62.5 57.5 62.5 58.5833333 62.5 59.25 62.5 60.25 61.75 61 60.75 61 59.75 61 59 60.25 59 59.25 59 58.25 59.75 57.5 60.75 57.5 61.4166667 57.5 62.5 57.5 64 57.5 65.5 57.5 66.5833333 57.5 67.25 57.5 68.25 57.5 69 58.25 69 59.25 69 60.25 68.25 61 67.25 61 66.25 61 65.5 60.25 65.5 59.25 65.5 58.5833333 65.5 57.5 65.5 56L65.5 52.75C65.5 51.75 66.25 51 67.25 51 68.25 51 69 51.75 69 52.75 69 53.75 68.25 54.5 67.25 54.5L64 54.5 64 54.5zM108.75 39C109.992641 39 111 37.9926407 111 36.75 111 35.5073593 109.992641 34.5 108.75 34.5 107.507359 34.5 106.5 35.5073593 106.5 36.75 106.5 37.9926407 107.507359 39 108.75 39L108.75 39zM104.5 32L106.5 32M100.25 35.75C100.25 35.75 102.25 31 102.5 30.5 102.75 30 103.25 30 103.5 30 103.75 30 104.5 30 104.5 31L104.5 36.5M102.25 39C101.007359 39 100 37.9926407 100 36.75 100 35.5073593 101.007359 34.5 102.25 34.5 103.492641 34.5 104.5 35.5073593 104.5 36.75 104.5 37.9926407 103.492641 39 102.25 39L102.25 39 102.25 39zM110.75 35.75C110.75 35.75 108.75 31 108.5 30.5 108.25 30 107.75 30 107.5 30 107.25 30 106.5 30 106.5 31L106.5 36.5M104.5 36.5L106.5 36.5\"/>\n    <path stroke=\"#DADADA\" stroke-linecap=\"round\" d=\"M98,56.623654 C98,55.5234613 97.0999011,54.6315789 95.9989566,54.6315789 L95,54.6315789 L90,59.8947368 L89.9942627,59.8947368 C88.8928618,59.8947368 88,60.7997758 88,61.8868119 L88,60.0079249 C88,61.1081176 88.9000989,62 90.0010434,62 L91,62 L96,56.7368421 L96.0057373,56.7368421 C97.1071382,56.7368421 98,55.8318032 98,54.744767 L98,56.623654 Z M90.5,55.6842105 C90.7761424,55.6842105 91,55.4485709 91,55.1578947 C91,54.8672186 90.7761424,54.6315789 90.5,54.6315789 C90.2238576,54.6315789 90,54.8672186 90,55.1578947 C90,55.4485709 90.2238576,55.6842105 90.5,55.6842105 Z M90.5,58.8421053 L90.5,57.5098684 C90.5,57.373614 90.6159668,57.2631579 90.75,57.2631579 L90.75,57.2631579 C90.8880712,57.2631579 91,57.3758079 91,57.5072985 L91,58.3157895 L90.5,58.8421053 Z M93,53.0526316 C93.2761424,53.0526316 93.5,52.816992 93.5,52.5263158 C93.5,52.2356396 93.2761424,52 93,52 C92.7238576,52 92.5,52.2356396 92.5,52.5263158 C92.5,52.816992 92.7238576,53.0526316 93,53.0526316 Z M93,56.2105263 L93,54.8782895 C93,54.742035 93.1159668,54.6315789 93.25,54.6315789 L93.25,54.6315789 C93.3880712,54.6315789 93.5,54.744229 93.5,54.8757196 L93.5,55.6842105 L93,56.2105263 Z\"/>\n  </g>\n</svg>\n')","position":"bottom"}} round="medium" elevation="xlarge" margin="medium" direction="column" alignSelf="center" animation={{"type":"fadeIn","size":"medium"}}>
          <Box align="center" justify="center" pad="xsmall" margin="xsmall">
              <Box align="center" justify="center" background={{"dark":false,"color":"light-2","image":`url('/podcasts/${podcast.id}/image')`}} round="xsmall" margin="medium" fill="vertical" pad="xlarge" />
              <Heading level="2" size="medium" margin="xsmall" textAlign="center">
                  {podcast.name}
              </Heading>
              <Heading level="3" size="medium" margin="xsmall" textAlign="center">
                  {episode.name}
              </Heading>
              <Paragraph size="small" margin="medium" textAlign="center">
              {episode.description.replace(/(<([^>]+)>)/gi, "")}
              </Paragraph>
          </Box>
      </Box>

    <Box align="center" pad="small" background={{"0":"b","1":"r","2":"a","3":"n","4":"d","color":"white","image":"url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"24 0 140 192\">\n  <g fill=\"none\" fill-rule=\"evenodd\">\n    <path stroke=\"#DADADA\" d=\"M73 19L73 12 75.5 12 76.5 10 80.5 10 81.5 12 84 12 84 19 73 19zM78.5 17.5C79.8807119 17.5 81 16.3807119 81 15 81 13.6192881 79.8807119 12.5 78.5 12.5 77.1192881 12.5 76 13.6192881 76 15 76 16.3807119 77.1192881 17.5 78.5 17.5zM150 20C152.761424 20 155 17.7614237 155 15 155 12.2385763 152.761424 10 150 10 147.238576 10 145 12.2385763 145 15 145 17.7614237 147.238576 20 150 20zM151.5 17C151.5 16.1715729 150.828427 15.5 150 15.5 149.171573 15.5 148.5 16.1715729 148.5 17M146.5 11.5L147.5 12.5M150 12.5L150 15.5M150 10.5L150 11.5M153.5 15L154.5 15M145.5 15L146.5 15M152.5 12.5L153.5 11.5M145.5 17.5L154.5 17.5M45 37.0001041C45 35.4999416 47 34.5002148 47 32.5000456 47 30.4998764 45.5 29 43.5 29 41.5 29 40 30.4998764 40 32.5000456 40 34.5002148 42 35.4999416 42 37.0001041 42 38.5002667 42 38.4999805 42 38.4999805 42 39.4999936 42.5 39.9999999 43.5 40 44.5 40.0000001 45 39.4999936 45 38.4999805 45 38.4999805 45 38.5002667 45 37.0001041zM42 37.4999675L45 37.4999675M71.5 29L71.5 32.5001023 68 38.5000205 68 40 78 40 78 38.5000205 74.5 32.5001023 74.5 29M74.50015 37.4998841C74.7762924 37.4998841 75.00015 37.2760295 75.00015 36.9998909 75.00015 36.7237523 74.7762924 36.4998977 74.50015 36.4998977 74.2240076 36.4998977 74.00015 36.7237523 74.00015 36.9998909 74.00015 37.2760295 74.2240076 37.4998841 74.50015 37.4998841zM71.50015 38.4998705C71.7762924 38.4998705 72.00015 38.2760159 72.00015 37.9998773 72.00015 37.7237387 71.7762924 37.4998841 71.50015 37.4998841 71.2240076 37.4998841 71.00015 37.7237387 71.00015 37.9998773 71.00015 38.2760159 71.2240076 38.4998705 71.50015 38.4998705zM76.00015 34.9999182C72.50015 33.4999386 73.00015 36.999891 70.00015 35.4999114M70 29.00015L76 29.00015M142.982321 29.0176786C142.982321 29.0176786 139.568321 28.7780062 138.275612 30.063614 138.263438 30.0828892 136.183741 32.1554847 136.183741 32.1554847L133.568903 32.6784524 132 33.7243878 136.183741 35.8162585 138.275612 40 139.321548 38.4310969 139.844515 35.8162585C139.844515 35.8162585 141.917111 33.7365617 141.936386 33.7243878 143.221994 32.4316787 142.982321 29.0176786 142.982321 29.0176786zM139.844515 32.6784524C139.555576 32.6784524 139.321548 32.4444244 139.321548 32.1554847 139.321548 31.8665451 139.555576 31.632517 139.844515 31.632517 140.133455 31.632517 140.367483 31.8665451 140.367483 32.1554847 140.367483 32.4444244 140.133455 32.6784524 139.844515 32.6784524zM134.614838 37.3851616C134.091871 36.8621939 133.045935 36.8621939 132.522968 37.3851616 132 37.9081293 132 40 132 40 132 40 134.091871 40 134.614838 39.4770323 135.137806 38.9540646 135.137806 37.9081293 134.614838 37.3851616zM14 36.5L14 32M14.0000001 34C14 32.5 14 31 10.5 31 10.5 32.5 10.5 34 14.0000001 34zM10 36.5L18 36.5M17 36.5L16 40 12 40 11 36.5 11 36.5M14 32C14 30.5 14 29 17.5 29 17.5 30.5 17.5 32 14 32zM167.25 40C168.492641 40 169.5 38.9396218 169.5 37.6315789 169.5 36.3235361 168.492641 35.2631579 167.25 35.2631579 166.007359 35.2631579 165 36.3235361 165 37.6315789 165 38.9396218 166.007359 40 167.25 40zM165 37.3684211L165 32.6315789 165 32.3684211C165 31.0603782 166.007359 30 167.25 30L167.5 30M176 37.3684211L176 32.6315789 176 32.3684211C176 31.0603782 174.992641 30 173.75 30L173.5 30M173.75 40C174.992641 40 176 38.9396218 176 37.6315789 176 36.3235361 174.992641 35.2631579 173.75 35.2631579 172.507359 35.2631579 171.5 36.3235361 171.5 37.6315789 171.5 38.9396218 172.507359 40 173.75 40zM169.5 37.8947368C169.5 37.8947368 169.5 36.8421053 170.5 36.8421053 171.5 36.8421053 171.5 37.8947368 171.5 37.8947368\"/>\n    <path stroke=\"#DADADA\" stroke-linecap=\"round\" d=\"M147.65975,78 C147.65975,77.4477153 147.201031,77 146.635173,77 C146.069315,77 145.610596,77.4477153 145.610596,78 C145.610596,78.5522847 146.069315,79 146.635173,79 L146.635173,79 M146.635173,80.5 C145.220527,80.5 144.073731,79.3807119 144.073731,78 C144.073731,76.6192881 145.220527,75.5 146.635173,75.5 C148.049818,75.5 149.196615,76.6192881 149.196615,78 C149.196615,78.4142136 149.540654,78.75 149.965048,78.75 C150.389441,78.75 150.73348,78.4142136 150.73348,78 C150.73348,75.790861 148.898606,74 146.635173,74 C144.37174,74 142.536865,75.790861 142.536865,78 C142.536865,80.209139 144.37174,82 146.635173,82 L147.65975,82 M141,78 C141,79.3360399 141.488086,80.5608157 142.29972,81.5137359 M151,74.5210393 C149.966613,73.287443 148.395112,72.5 146.635173,72.5 C144.891562,72.5 143.332908,73.2728999 142.299246,74.486821 M149.978319,71.8054151 C148.980064,71.2911423 147.842454,71 146.635173,71 C145.437065,71 144.307574,71.2867346 143.314807,71.7937307\"/>\n    <path stroke=\"#DADADA\" d=\"M49 10L39 14 48.25 18 49 10zM43 18.75L44.5 16.5M45.75 13.25L42.5 15.5 42.8580575 18.0064025C42.9364502 18.5551512 43.0737767 18.5573397 43.1637187 18.0176878L43.5 16 45.75 13.25zM121 53L129 53 129 62 121 62 121 53zM121 53L129 53 129 52C129 51.4477153 128.546964 51 128.00297 51L121.99703 51C121.446386 51 121 51.4438648 121 52L121 53zM118 54.998576C118 54.1709353 118.665797 53.5 119.5 53.5L121 53.5 121 59.5 119.5 59.5C118.671573 59.5 118 58.8349702 118 58.001424L118 54.998576zM123 54.5L123 59.5M125 54.5L125 59.5M127 54.5L127 59.5M99.5 71L99.5 73.7486574C99.5 74.9920396 98.5013041 76 97.25 76L97.25 76C96.0073593 76 95 74.9881754 95 73.7486574L95 71M96.5 74C96.5 74 96.5 73.7842474 96.5 73.504611L96.5 71M98 74C98 74 98 73.7842474 98 73.504611L98 71M96.5 76L96.5 81.2400959C96.5 81.6597793 96.8328986 82 97.25 82L97.25 82C97.6642136 82 98 81.6602228 98 81.2400959L98 76M101 79.5L101 81.2499176C101 81.6641767 101.332899 82 101.75 82L101.75 82C102.164214 82 102.5 81.6658422 102.5 81.2476306L102.5 78C102.5 78 104 78 104 76.5 104 75 104 75.5 104 74 104 72.5 103 71.5 101 71.5 101 71.5 101 75.4972807 101 79.5L101 79.5zM41 88.5C41 87.6715729 41.6785455 87 42.5008327 87L45 87 45 88.5C45 89.3284271 44.3214545 90 43.4991673 90L42.5008327 90C41.6719457 90 41 89.3342028 41 88.5L41 88.5zM48 88.5C48 87.6715729 48.6785455 87 49.5008327 87L52 87 52 88.5C52 89.3284271 51.3214545 90 50.4991673 90L49.5008327 90C48.6719457 90 48 89.3342028 48 88.5L48 88.5zM45 87L45 80 52 80 52 86.75M45 82L52 82\"/>\n    <path stroke=\"#DADADA\" d=\"M114.5,17.5 L114.5,12.5 L114.5,17.5 Z M114.5,20 C117.537566,20 120,17.5375661 120,14.5 C120,11.4624339 117.537566,9 114.5,9 C111.462434,9 109,11.4624339 109,14.5 C109,17.5375661 111.462434,20 114.5,20 Z M117,14.5 L114.5,12 L112,14.5\" transform=\"matrix(1 0 0 -1 0 29)\"/>\n    <path stroke=\"#DADADA\" d=\"M31 57.7826087C31.2761424 57.7826087 31.5 57.5490181 31.5 57.2608696 31.5 56.972721 31.2761424 56.7391304 31 56.7391304 30.7238576 56.7391304 30.5 56.972721 30.5 57.2608696 30.5 57.5490181 30.7238576 57.7826087 31 57.7826087zM36 57.7826087C36.2761424 57.7826087 36.5 57.5490181 36.5 57.2608696 36.5 56.972721 36.2761424 56.7391304 36 56.7391304 35.7238576 56.7391304 35.5 56.972721 35.5 57.2608696 35.5 57.5490181 35.7238576 57.7826087 36 57.7826087zM33.5 58.826087C33.75 58.826087 34 58.6586205 34 58.3043478 34 58.2454599 33 58.2650168 33 58.3043478 33 58.6586205 33.25 58.826087 33.5 58.826087zM29 63C29 63 29.0017057 58.826087 29 56.7391304 29.0017057 54.6521739 28.7765468 52.5652174 33.5 52.5652174 38.2234532 52.5652174 37.9982943 54.6521739 38 56.7391304 37.9982943 58.826087 38 63 38 63M37.534109 54.1304348C39.1636114 54.1304348 39.3239028 52.2628239 38.5568483 51.4624192 37.7897938 50.6620145 36 50.8292751 36 52.5296254M31 60.3913043C31 60.2851965 32.2500001 60.9922354 33.5 60.9130435 34.7499999 60.9922355 36 60.1311503 36 60.3913043 36 60.8098425 35.25 61.4347826 33.5 61.4347826 31.75 61.4347826 31 60.6557961 31 60.3913043zM29.4723215 54.1304348C27.8022035 54.1304348 27.6900299 52.2628239 28.4538691 51.4624192 29.2177084 50.6620145 31 50.8292751 31 52.5296254M3 12.7C3 10.5 4.75 10 5.75 10 7 10 8 11 8.5 11.75 9 11 10 10 11.25 10 12.25 10 14 10.5 14 12.7 14 16 8.5 19 8.5 19 8.5 19 3 16 3 12.7zM181.261353 10C180.551835 10 179.519808 10.7615701 179.261802 11.2692834 178.893056 11.9949123 178.953916 12.2799781 179.1973 13.0462802 179.519808 14.061707 180.465373 15.8616098 181.777367 17.1079872 183.647915 18.884984 185.38946 19.6465541 186.16348 19.9004108 186.9375 20.1542675 187.776022 19.9004108 188.292036 19.3926974 188.808049 18.884984 189.324062 18.3772707 188.743547 17.6157006 188.332184 17.0760385 187.732926 16.4521441 187.002002 16.0925605 186.337385 15.7655972 185.941299 15.8846104 185.711969 16.3464172 185.585191 16.6017108 185.545814 17.0907187 185.453962 17.3618439 185.338077 17.7039067 184.873447 17.6157006 184.357434 17.3618439 183.863414 17.1188075 182.615888 16.0925605 181.583862 14.5694204 180.944452 13.6257324 181.966489 13.6196139 182.615888 13.3001369 183.131902 13.0462802 183.291861 12.4624021 182.873895 11.7769968 182.099875 10.5077134 181.841868 10 181.261353 10zM64 54.5C62.5 54.5 61.4166667 54.5 60.75 54.5 59.75 54.5 59 53.75 59 52.75 59 51.75 59.75 51 60.75 51 61.75 51 62.5 51.75 62.5 52.75 62.5 53.4166667 62.5 54.5 62.5 56 62.5 57.5 62.5 58.5833333 62.5 59.25 62.5 60.25 61.75 61 60.75 61 59.75 61 59 60.25 59 59.25 59 58.25 59.75 57.5 60.75 57.5 61.4166667 57.5 62.5 57.5 64 57.5 65.5 57.5 66.5833333 57.5 67.25 57.5 68.25 57.5 69 58.25 69 59.25 69 60.25 68.25 61 67.25 61 66.25 61 65.5 60.25 65.5 59.25 65.5 58.5833333 65.5 57.5 65.5 56L65.5 52.75C65.5 51.75 66.25 51 67.25 51 68.25 51 69 51.75 69 52.75 69 53.75 68.25 54.5 67.25 54.5L64 54.5 64 54.5zM108.75 39C109.992641 39 111 37.9926407 111 36.75 111 35.5073593 109.992641 34.5 108.75 34.5 107.507359 34.5 106.5 35.5073593 106.5 36.75 106.5 37.9926407 107.507359 39 108.75 39L108.75 39zM104.5 32L106.5 32M100.25 35.75C100.25 35.75 102.25 31 102.5 30.5 102.75 30 103.25 30 103.5 30 103.75 30 104.5 30 104.5 31L104.5 36.5M102.25 39C101.007359 39 100 37.9926407 100 36.75 100 35.5073593 101.007359 34.5 102.25 34.5 103.492641 34.5 104.5 35.5073593 104.5 36.75 104.5 37.9926407 103.492641 39 102.25 39L102.25 39 102.25 39zM110.75 35.75C110.75 35.75 108.75 31 108.5 30.5 108.25 30 107.75 30 107.5 30 107.25 30 106.5 30 106.5 31L106.5 36.5M104.5 36.5L106.5 36.5\"/>\n    <path stroke=\"#DADADA\" stroke-linecap=\"round\" d=\"M98,56.623654 C98,55.5234613 97.0999011,54.6315789 95.9989566,54.6315789 L95,54.6315789 L90,59.8947368 L89.9942627,59.8947368 C88.8928618,59.8947368 88,60.7997758 88,61.8868119 L88,60.0079249 C88,61.1081176 88.9000989,62 90.0010434,62 L91,62 L96,56.7368421 L96.0057373,56.7368421 C97.1071382,56.7368421 98,55.8318032 98,54.744767 L98,56.623654 Z M90.5,55.6842105 C90.7761424,55.6842105 91,55.4485709 91,55.1578947 C91,54.8672186 90.7761424,54.6315789 90.5,54.6315789 C90.2238576,54.6315789 90,54.8672186 90,55.1578947 C90,55.4485709 90.2238576,55.6842105 90.5,55.6842105 Z M90.5,58.8421053 L90.5,57.5098684 C90.5,57.373614 90.6159668,57.2631579 90.75,57.2631579 L90.75,57.2631579 C90.8880712,57.2631579 91,57.3758079 91,57.5072985 L91,58.3157895 L90.5,58.8421053 Z M93,53.0526316 C93.2761424,53.0526316 93.5,52.816992 93.5,52.5263158 C93.5,52.2356396 93.2761424,52 93,52 C92.7238576,52 92.5,52.2356396 92.5,52.5263158 C92.5,52.816992 92.7238576,53.0526316 93,53.0526316 Z M93,56.2105263 L93,54.8782895 C93,54.742035 93.1159668,54.6315789 93.25,54.6315789 L93.25,54.6315789 C93.3880712,54.6315789 93.5,54.744229 93.5,54.8757196 L93.5,55.6842105 L93,56.2105263 Z\"/>\n  </g>\n</svg>\n')","position":"bottom"}} round="medium" elevation="xlarge" margin="medium" direction="column" alignSelf="center" animation={{"type":"fadeIn","size":"medium"}} justify="end" fill="horizontal">


        {audioPlayer} 
    </Box>
    
        </Box>
        
      </Grommet>
    )
}
