// Server-side per-client key/value store (/client-status), used for
// playback positions and per-show "started" episode lists. Kept
// wire-compatible with the previous UI so existing progress carries over.

export function getClientToken() {
  let token = safeGet('clientToken')
  if (token === null) {
    token = window.crypto.getRandomValues(new Uint32Array(10)).join('')
    safeSet('clientToken', token)
  }
  return token
}

function authHeaders() {
  return { Authorization: `Basic ${getClientToken()}` }
}

export async function getClientInfo(key) {
  try {
    const resp = await fetch(`/client-status/${key}`, { headers: authHeaders() })
    if (resp.status !== 200) return null
    return await resp.text()
  } catch {
    return null
  }
}

export function setClientInfo(key, value) {
  return fetch(`/client-status/${key}`, { method: 'PUT', body: String(value), headers: authHeaders() })
    .catch(() => {})
}

export function deleteClientInfo(key) {
  return fetch(`/client-status/${key}`, { method: 'DELETE', headers: authHeaders() })
    .catch(() => {})
}

// localStorage wrappers — storage can be unavailable (private mode,
// blocked site data), so every access is guarded.
export function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function safeGetJSON(key, fallback) {
  const raw = safeGet(key)
  if (raw === null) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

export function safeSetJSON(key, value) {
  safeSet(key, JSON.stringify(value))
}

export function positionKey(podcastId, episodeId) {
  return `${podcastId}-${episodeId}`
}

export function startedKey(podcastId) {
  return `played-episodes-${podcastId}`
}
