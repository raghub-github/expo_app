'use client'

import { useEffect, useState } from 'react'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { readCachedServiceArea, writeCachedServiceArea } from '@/lib/orderListingCache'

export type OrderServiceAreaMode = 'full' | 'checking' | 'no-service'

function serviceKey(lat: number, lon: number): string {
  return `${lat},${lon}`
}

/**
 * After the user commits a location (sheet / account / URL), checks /api/restaurants/availability.
 * Until then, mode stays `full` so the catalog is never restricted.
 */
export function useOrderServiceArea(): OrderServiceAreaMode {
  const { location, hasCoords, hydrated } = useLocationContext()
  const committed = location.locationCommittedByUser === true
  const shouldCheck = hydrated && committed && hasCoords
  const key =
    location.lat != null && location.lon != null ? serviceKey(location.lat, location.lon) : ''
  const [serviceOk, setServiceOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (!hydrated) return
    if (!committed || !hasCoords) {
      setServiceOk(true)
      return
    }
    let cancelled = false
    const lat = location.lat!
    const lon = location.lon!
    const k = serviceKey(lat, lon)
    const hit = readCachedServiceArea(k)
    if (hit == null) {
      setServiceOk(null)
    } else {
      setServiceOk(hit)
    }
    fetch(
      `/api/restaurants/availability?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&radius_km=15&listing=food`
    )
      .then(async (r) => {
        if (cancelled) return
        if (r.ok) {
          const d = await r.json()
          const ok = Boolean(d?.available === true && (d.count ?? 0) > 0)
          writeCachedServiceArea(k, ok)
          setServiceOk(ok)
          return
        }
        const rest = await fetch(
          `/api/restaurants?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&radius_km=15&listing=food`
        )
        if (cancelled) return
        if (!rest.ok) {
          writeCachedServiceArea(k, true)
          setServiceOk(true)
          return
        }
        const list = await rest.json()
        const ok = Array.isArray(list) && list.length > 0
        writeCachedServiceArea(k, ok)
        setServiceOk(ok)
      })
      .catch(() => {
        if (cancelled) return
        writeCachedServiceArea(k, true)
        setServiceOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, committed, hasCoords, location.lat, location.lon])

  if (!hydrated) return 'full'
  if (!shouldCheck) return 'full'
  const resolved = serviceOk ?? (key ? readCachedServiceArea(key) : null)
  if (resolved === null) return 'checking'
  if (resolved === false) return 'no-service'
  return 'full'
}
