'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const DISMISS_STORAGE_KEY = 'gatimitra_location_prompt_dismissed_v1'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(DISMISS_STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

/**
 * Auto-open a location welcome modal once per browser tab session when no address is committed.
 * Dismiss (X) is remembered across reloads in the same tab (sessionStorage).
 */
export function useLocationPromptAutoOpen(args: {
  enabled: boolean
  hydrated: boolean
  locationCommitted: boolean
  promptOpen: boolean
  openPrompt: () => void
}) {
  const [dismissed, setDismissed] = useState(false)
  const selectedRef = useRef(false)

  useEffect(() => {
    if (readDismissed()) setDismissed(true)
  }, [])

  useEffect(() => {
    if (!args.enabled || !args.hydrated) return
    if (args.locationCommitted || dismissed || args.promptOpen) return
    if (readDismissed()) {
      setDismissed(true)
      return
    }
    args.openPrompt()
  }, [
    args.enabled,
    args.hydrated,
    args.locationCommitted,
    dismissed,
    args.promptOpen,
    args.openPrompt,
  ])

  const markSelected = useCallback(() => {
    selectedRef.current = true
  }, [])

  const handlePromptDismiss = useCallback(() => {
    if (!selectedRef.current && !args.locationCommitted) {
      setDismissed(true)
      writeDismissed()
    }
    selectedRef.current = false
  }, [args.locationCommitted])

  return { handlePromptDismiss, markSelected, dismissed }
}
