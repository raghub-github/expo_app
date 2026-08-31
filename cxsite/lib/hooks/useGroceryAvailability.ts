'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { extractWebGeoHints } from '@/lib/extractWebGeoHints'
import { isPanIndiaBrowsingMode } from '@/lib/panIndiaLocation'

type AvailabilityResponse = { available: boolean; count: number }

/**
 * Grocery arc tile — enabled when at least one GROCERY store is available.
 * Pan-India: any grocery store nationally. With coords: bbox nearby (same as listings).
 */
export function useGroceryAvailability() {
  const { location, hydrated } = useLocationContext()
  const panIndia = isPanIndiaBrowsingMode(location)
  const hints = useMemo(() => extractWebGeoHints(location), [location])

  const canQuery = hydrated && (panIndia || hints.lat != null || hints.lng != null)

  const [data, setData] = useState<AvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!canQuery) {
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const qs = new URLSearchParams()
    if (!panIndia && hints.lat != null && hints.lng != null) {
      qs.set('lat', String(hints.lat))
      qs.set('lon', String(hints.lng))
      qs.set('radius_km', '15')
    }

    setLoading(true)
    fetch(`/api/grocery/availability?${qs.toString()}`)
      .then((r) => r.json())
      .then((json: AvailabilityResponse) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setData({ available: false, count: 0 })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canQuery, panIndia, hints.lat, hints.lng])

  const groceryEnabled = panIndia
    ? data?.available === true || (loading && data == null)
    : data?.available === true

  return {
    groceryEnabled,
    groceryCount: data?.count ?? 0,
    loading: canQuery && loading && !data,
    resolved: !canQuery || (!loading && data != null),
  }
}
