import { Html5QrcodeScanner } from "html5-qrcode"
import React from 'react'

const qrcodeRegionId = "html5qr-code-full-region"

export class Html5QrcodePlugin extends React.Component {
    render() {
        return <div id={qrcodeRegionId} />
    }

    componentWillUnmount() {
        this.html5QrcodeScanner.clear().catch(error => {
            console.error("Failed to clear html5QrcodeScanner. ", error)
        })
    }

    componentDidMount() {
        function createConfig(props) {
            var config = {}
            if (props.fps) {
            config.fps = props.fps
            }
            if (props.qrbox) {
            config.qrbox = props.qrbox
            }
            if (props.aspectRatio) {
            config.aspectRatio = props.aspectRatio
            }
            if (props.disableFlip !== undefined) {
            config.disableFlip = props.disableFlip
            }
            return config
        }

        var config = createConfig(this.props)
        var verbose = this.props.verbose === true

        // Suceess callback is required.
        if (!(this.props.qrCodeSuccessCallback )) {
            throw "qrCodeSuccessCallback is required callback."
        }

        this.html5QrcodeScanner = new Html5QrcodeScanner(
            qrcodeRegionId, config, verbose)
        this.html5QrcodeScanner.render(
            this.props.qrCodeSuccessCallback,
            this.props.qrCodeErrorCallback)
    }
}