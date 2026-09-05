'use client'

import { useEffect } from 'react'

const RELOAD_KEY = 'gm_chunk_reload'

function isChunkFailure(err: unknown, message?: string): boolean {
  const name = err instanceof Error ? err.name : ''
  const msg = `${message ?? ''} ${err instanceof Error ? err.message : String(err ?? '')}`
  return (
    name === 'ChunkLoadError' ||
    /ChunkLoadError|Loading chunk \d+ failed|_next\/static\/chunks/i.test(msg)
  )
}

/** Hard-reload once when a Next.js page chunk fails (avoids a blank 404). */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const path = window.location.pathname
    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === path) return
        sessionStorage.setItem(RELOAD_KEY, path)
      } catch {
        /* ignore */
      }
      window.location.reload()
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkFailure(event.reason)) return
      event.preventDefault()
      reloadOnce()
    }
    const onError = (event: ErrorEvent) => {
      if (!isChunkFailure(event.error, event.message)) return
      reloadOnce()
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    const clearTimer = window.setTimeout(() => {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === path) sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        /* ignore */
      }
    }, 8000)

    return () => {
      window.clearTimeout(clearTimer)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
