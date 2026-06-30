'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { extractWebGeoHints } from '@/lib/extractWebGeoHints'
import type { GeoEnabledServices } from '@/lib/landingServiceAvailability'
import { isPanIndiaBrowsingMode } from '@/lib/panIndiaLocation'

const PAN_INDIA_DEFAULTS: GeoEnabledServices = {
  food: true,
  ride: true,
  parcels: false,
}

const DEFAULT_WHILE_LOADING: GeoEnabledServices = {
  food: true,
  ride: true,
  parcels: false,
}

const ALL_DISABLED: GeoEnabledServices = {
  food: false,
  ride: false,
  parcels: false,
}

type GeoApiResponse = {
  ok: true
  food: boolean
  parcel: boolean
  ride: boolean
}

/**
 * Geo FOOD / RIDE / PARCEL toggles for the user's committed delivery address.
 * Until the user commits a location (or while browsing pan‑India), Food & Ride stay active.
 */
export function useGeoServiceAvailability() {
  const { location, hydrated } = useLocationContext()
  const panIndiaMode = isPanIndiaBrowsingMode(location)
  const hints = useMemo(() => extractWebGeoHints(location), [location])

  const canQuery =
    !panIndiaMode &&
    !!(
      hints.pincode ||
      hints.state ||
      (hints.lat != null && hints.lng != null)
    )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [data, setData] = useState<GeoApiResponse | null>(null)

  useEffect(() => {
    if (!hydrated || !canQuery) {
      setData(null)
      setError(false)
      setLoading(false)
      return
    }

    let cancelled = false
    const qs = new URLSearchParams()
    if (hints.pincode) qs.set('pincode', hints.pincode)
    if (hints.state) qs.set('state', hints.state)
    if (hints.lat != null && hints.lng != null) {
      qs.set('lat', String(hints.lat))
      qs.set('lng', String(hints.lng))
    }

    setLoading(true)
    setError(false)

    fetch(`/api/geo/services?${qs.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json?.ok) {
          setError(true)
          setData(null)
          return
        }
        setData(json as GeoApiResponse)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hydrated, canQuery, hints.pincode, hints.state, hints.lat, hints.lng])

  const enabledServices: GeoEnabledServices = useMemo(() => {
    if (panIndiaMode) return PAN_INDIA_DEFAULTS
    if (!canQuery) return ALL_DISABLED
    if (loading && !data) return DEFAULT_WHILE_LOADING
    if (error || !data) return ALL_DISABLED
    return {
      food: data.food,
      ride: data.ride,
      parcels: data.parcel,
    }
  }, [panIndiaMode, canQuery, loading, data, error])

  return {
    enabledServices,
    canQuery,
    panIndiaMode,
    loading: canQuery && loading && !data,
    resolved: panIndiaMode || (canQuery && !loading && !!data && !error),
  }
}
