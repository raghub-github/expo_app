'use client'

import { useEffect, useState } from 'react'
import { useLocationContext } from '@/components/providers/LocationProvider'

export type OrderServiceAreaMode = 'full' | 'checking' | 'no-service'

/**
 * After the user commits a location (sheet / account / URL), checks /api/restaurants/availability.
 * Until then, mode stays `full` so the catalog is never restricted.
 */
export function useOrderServiceArea(): OrderServiceAreaMode {
  const { location, hasCoords, hydrated } = useLocationContext()
  const committed = location.locationCommittedByUser === true
  const shouldCheck = hydrated && committed && hasCoords
  const [serviceOk, setServiceOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (!hydrated) return
    if (!committed || !hasCoords) {
      setServiceOk(true)
      return
    }
    let cancelled = false
    setServiceOk(null)
    const lat = location.lat!
    const lon = location.lon!
    fetch(
      `/api/restaurants/availability?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&radius_km=15`
    )
      .then(async (r) => {
        if (cancelled) return
        if (r.ok) {
          const d = await r.json()
          const ok = Boolean(d?.available === true && (d.count ?? 0) > 0)
          setServiceOk(ok)
          return
        }
        const rest = await fetch(
          `/api/restaurants?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&radius_km=15`
        )
        if (cancelled) return
        if (!rest.ok) {
          setServiceOk(true)
          return
        }
        const list = await rest.json()
        setServiceOk(Array.isArray(list) && list.length > 0)
      })
      .catch(() => {
        if (cancelled) return
        setServiceOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, committed, hasCoords, location.lat, location.lon])

  if (!hydrated) return 'full'
  if (!shouldCheck) return 'full'
  if (serviceOk === null) return 'checking'
  if (serviceOk === false) return 'no-service'
  return 'full'
}
