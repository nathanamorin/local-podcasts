import { useEffect } from 'react'

export function useKeyPress(targetKeyCode, handler) {
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
    }, []) // Empty array ensures that effect is only run on mount and unmount
  }