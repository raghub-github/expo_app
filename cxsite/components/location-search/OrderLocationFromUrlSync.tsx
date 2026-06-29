'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocationContext } from '@/components/providers/LocationProvider'

function normalizeDisplay(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function sameCoords(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 1e-6
}

/**
 * Sync `/order?location=&lat=&lon=` into LocationProvider so restaurant APIs
 * receive geo params after refresh or shared links.
 */
function OrderLocationFromUrlSyncInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setLocation, hydrated, location } = useLocationContext()
  const latestRef = useRef(location)
  latestRef.current = location

  useEffect(() => {
    if (!hydrated || pathname !== '/order') return

    const locationParam = searchParams.get('location')?.trim() ?? ''
    const latStr = searchParams.get('lat')
    const lonStr = searchParams.get('lon')

    if (!locationParam && latStr == null && lonStr == null) return

    if (latStr != null && lonStr != null) {
      const lat = Number(latStr)
      const lon = Number(lonStr)
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        const displayName = locationParam || latestRef.current.displayName
        const loc = latestRef.current
        if (
          normalizeDisplay(loc.displayName) !== normalizeDisplay(displayName) ||
          !sameCoords(loc.lat, lat) ||
          !sameCoords(loc.lon, lon) ||
          loc.locationCommittedByUser !== true
        ) {
          setLocation(displayName, lat, lon, { userInitiated: true, source: 'selected' })
        }
        return
      }
    }

    if (locationParam) {
      const loc = latestRef.current
      if (
        normalizeDisplay(loc.displayName) !== normalizeDisplay(locationParam) ||
        loc.locationCommittedByUser !== true
      ) {
        setLocation(
          locationParam,
          loc.lat ?? undefined,
          loc.lon ?? undefined,
          { userInitiated: true, source: 'selected' }
        )
      }
    }
  }, [pathname, searchParams, setLocation, hydrated])

  return null
}

export default function OrderLocationFromUrlSync() {
  return (
    <Suspense fallback={null}>
      <OrderLocationFromUrlSyncInner />
    </Suspense>
  )
}
