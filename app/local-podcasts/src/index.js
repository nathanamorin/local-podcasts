import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './styles/app.css'
import { applyTheme } from './pages/misc'
import { safeGet } from './lib/storage'
import reportWebVitals from './reportWebVitals'
import * as serviceWorkerRegistration from './serviceWorkerRegistration'

// Apply a saved light/dark override before first paint.
applyTheme(safeGet('theme'))

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
)

// The precaching service worker (CRA/workbox default) stays "waiting" and
// keeps serving an old cached bundle until every tab for this origin is
// closed, which made deployed changes invisible for an indefinite amount of
// time after every release. This app has no offline-support requirement, so
// unregister any previously-installed worker instead of registering a new
// one, letting the browser always fetch fresh assets.
serviceWorkerRegistration.unregister()

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
