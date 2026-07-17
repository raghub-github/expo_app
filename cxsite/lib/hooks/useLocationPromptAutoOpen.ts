'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebGeolocationPermission } from '@/lib/webLocationPermission'

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
 * Auto-open location welcome modal when permission is still undetermined
 * and no address is committed. Skips when GPS is already granted (auto-fetch)
 * or denied (enable-location modal handles that).
 */
export function useLocationPromptAutoOpen(args: {
  enabled: boolean
  hydrated: boolean
  locationCommitted: boolean
  promptOpen: boolean
  openPrompt: () => void
  /** When granted, LocationProvider auto-fetches — do not open welcome. */
  permissionStatus?: WebGeolocationPermission
  locationLoading?: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  const selectedRef = useRef(false)
  const permissionStatus = args.permissionStatus ?? 'undetermined'
  const locationLoading = args.locationLoading === true

  useEffect(() => {
    if (readDismissed()) setDismissed(true)
  }, [])

  useEffect(() => {
    if (!args.enabled || !args.hydrated) return
    if (permissionStatus === 'granted' || permissionStatus === 'denied') return
    if (locationLoading) return
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
    permissionStatus,
    locationLoading,
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
