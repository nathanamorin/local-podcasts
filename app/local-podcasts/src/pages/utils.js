import { useEffect } from 'react'

export function useKeyPress(targetKeyCode, dependencies, handler) {
    // If pressed key is our target key then set to true
    function downHandler({ code }) {
      if (code === targetKeyCode) {
        handler()
      }
    }
    // Add event listeners
    useEffect(() => {
      window.addEventListener("keydown", downHandler)
      // Remove event listeners on cleanup
      return () => {
        window.removeEventListener("keydown", downHandler)
      }
    }, dependencies) // Empty array ensures that effect is only run on mount and unmount
  }

export function getClientToken() {
  const token = localStorage.getItem("clientToken")
  if (token === null) {
    const newToken = window.crypto.getRandomValues(new Uint32Array(10)).join("")

    setClientToken(newToken)
    return newToken
  }

  return token
}

export function setClientToken(clientToken) {
  localStorage.setItem("clientToken", clientToken)
}

export function deleteClientToken(clientToken) {
  localStorage.removeItem("clientToken")
}

export async function getClientInfo(key) {
  const resp = await fetch(`/client-status/${key}`, {
    headers: {
      Authorization: `Basic ${getClientToken()}`
    }
  })
  if (resp.status != 200) {
    return null
  }

  return await resp.text()
}

export async function setClientInfo(key, value) {
  await fetch(`/client-status/${key}`, {
    method: 'PUT',
    body: value,
    headers: {
      Authorization: `Basic ${getClientToken()}`
    }
  })
}

export async function deleteClientInfo(key) {
  await fetch(`/client-status/${key}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${getClientToken()}`
    }
  })
}