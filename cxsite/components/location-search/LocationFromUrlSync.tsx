'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { slugToTitle } from '@/lib/slug'

function normalizeDisplay(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function sameCoords(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 1e-6
}

export type LocationFromUrlVariant = 'legacy' | 'indiaAll' | 'indiaAllStores'

async function resolveCoordsFromSlugs(
  cityDisplay: string,
  areaDisplay: string,
  signal: AbortSignal
): Promise<{ lat: number; lon: number } | null> {
  const queries =
    areaDisplay.trim().length > 0
      ? [`${areaDisplay}, ${cityDisplay}, India`, `${cityDisplay}, India`]
      : [`${cityDisplay}, India`]

  for (const q of queries) {
    const res = await fetch(`/api/locations/search?${new URLSearchParams({ q, limit: '8' })}`, {
      signal,
    })
    if (!res.ok) continue
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) continue
    for (const row of data as Array<{ latitude?: number; longitude?: number }>) {
      const lat = row.latitude != null ? Number(row.latitude) : NaN
      const lon = row.longitude != null ? Number(row.longitude) : NaN
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        return { lat, lon }
      }
    }
  }
  return null
}

/**
 * Syncs URL → LocationProvider display name for:
 * - `legacy`: /[city]/[area]
 * - `indiaAll`: /india/[city]/[area]/All (Magicpin-style discovery)
 * - `indiaAllStores`: /india/[city]/[area]/All/Stores (Around You with location in path)
 *
 * Also forward-geocodes city/area slugs so lat/lon are set (Around You "Distance" sort + APIs).
 */
function LocationFromUrlSyncInner({
  citySlug,
  areaSlug,
  variant = 'legacy',
}: {
  citySlug: string
  areaSlug: string
  variant?: LocationFromUrlVariant
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setLocation, hydrated, location } = useLocationContext()
  const latestRef = useRef(location)
  latestRef.current = location

  useEffect(() => {
    if (!hydrated) return

    const segments = pathname?.split('/').filter(Boolean) ?? []
    let match = false
    if (variant === 'legacy') {
      match = segments.length >= 2 && segments[0] === citySlug && segments[1] === areaSlug
    } else if (variant === 'indiaAll') {
      match =
        segments.length >= 4 &&
        segments[0] === 'india' &&
        segments[1] === citySlug &&
        segments[2] === areaSlug &&
        segments[3] === 'All'
    } else if (variant === 'indiaAllStores') {
      match =
        segments.length >= 5 &&
        segments[0] === 'india' &&
        segments[1] === citySlug &&
        segments[2] === areaSlug &&
        segments[3] === 'All' &&
        segments[4] === 'Stores'
    }
    if (!match) return

    const cityDisplay = slugToTitle(citySlug)
    const areaDisplay = slugToTitle(areaSlug)
    const displayName = areaDisplay ? `${areaDisplay}, ${cityDisplay}` : cityDisplay

    const latStr = searchParams.get('lat')
    const lonStr = searchParams.get('lon')
    if (latStr != null && lonStr != null) {
      const lat = Number(latStr)
      const lon = Number(lonStr)
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        const loc = latestRef.current
        if (
          normalizeDisplay(loc.displayName) !== normalizeDisplay(displayName) ||
          !sameCoords(loc.lat, lat) ||
          !sameCoords(loc.lon, lon) ||
          loc.locationCommittedByUser !== true
        ) {
          setLocation(displayName, lat, lon, { userInitiated: true })
        }
        return
      }
    }

    const loc = latestRef.current
    const sameDisplay =
      loc.locationCommittedByUser === true &&
      normalizeDisplay(loc.displayName) === normalizeDisplay(displayName)

    if (sameDisplay && loc.lat != null && loc.lon != null) {
      if (loc.locationCommittedByUser !== true) {
        setLocation(displayName, loc.lat, loc.lon, { userInitiated: true })
      }
      return
    }

    if (
      normalizeDisplay(loc.displayName) !== normalizeDisplay(displayName) ||
      loc.lat != null ||
      loc.lon != null ||
      loc.locationCommittedByUser !== true
    ) {
      setLocation(displayName, null, null, { userInitiated: true })
    }

    const controller = new AbortController()
    const run = async () => {
      try {
        const coords = await resolveCoordsFromSlugs(cityDisplay, areaDisplay, controller.signal)
        if (controller.signal.aborted) return
        if (coords) {
          const latest = latestRef.current
          if (
            normalizeDisplay(latest.displayName) !== normalizeDisplay(displayName) ||
            !sameCoords(latest.lat, coords.lat) ||
            !sameCoords(latest.lon, coords.lon) ||
            latest.locationCommittedByUser !== true
          ) {
            setLocation(displayName, coords.lat, coords.lon, { userInitiated: true })
          }
        }
      } catch {
        // Aborted or network error — keep display-only location
      }
    }
    void run()
    return () => controller.abort()
  }, [pathname, citySlug, areaSlug, setLocation, variant, hydrated, searchParams])

  return null
}

/** `useSearchParams` requires a Suspense boundary in Next.js App Router. */
export default function LocationFromUrlSync(props: {
  citySlug: string
  areaSlug: string
  variant?: LocationFromUrlVariant
}) {
  return (
    <Suspense fallback={null}>
      <LocationFromUrlSyncInner {...props} />
    </Suspense>
  )
}
