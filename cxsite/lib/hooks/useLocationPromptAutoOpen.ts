'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Auto-open a location welcome modal once per page load when no address is committed.
 * Dismiss (X) is remembered until full page reload (in-memory only).
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
    if (!args.enabled || !args.hydrated) return
    if (args.locationCommitted || dismissed || args.promptOpen) return
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
    }
    selectedRef.current = false
  }, [args.locationCommitted])

  return { handlePromptDismiss, markSelected, dismissed }
}
