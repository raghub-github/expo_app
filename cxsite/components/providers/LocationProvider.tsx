'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export type LocationState = {
  displayName: string
  lat: number | null
  lon: number | null
  /**
   * True after the user explicitly sets location (sheet, saved address, URL city, header selection).
   * Auto GPS in this provider does not set this — full catalog stays visible until then.
   */
  locationCommittedByUser?: boolean
}

const defaultState: LocationState = {
  displayName: 'India',
  lat: null,
  lon: null,
  locationCommittedByUser: false,
}
const STORAGE_KEY = 'gatimitra_location_v1'

export type SetLocationOptions = {
  userInitiated?: boolean
  /** When true, clears the “user committed location” flag (pan‑India browse). */
  clearLocationCommit?: boolean
}

type LocationContextValue = {
  location: LocationState
  setLocation: (
    displayName: string,
    lat?: number | null,
    lon?: number | null,
    options?: SetLocationOptions
  ) => void
  hasCoords: boolean
  hydrated: boolean
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<LocationState>(defaultState)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocationState>
        setLocationState({
          displayName:
            typeof parsed.displayName === 'string' && parsed.displayName.trim() !== ''
              ? parsed.displayName
              : 'India',
          lat: typeof parsed.lat === 'number' ? parsed.lat : null,
          lon: typeof parsed.lon === 'number' ? parsed.lon : null,
          locationCommittedByUser: parsed.locationCommittedByUser === true,
        })
      }
    } catch {
      // ignore malformed persisted location
    } finally {
      setHydrated(true)
    }
  }, [])

  const setLocation = useCallback(
    (displayName: string, lat?: number | null, lon?: number | null, options?: SetLocationOptions) => {
      setLocationState((prev) => {
        const nextDisplayName = displayName || prev.displayName
        const nextLat = lat !== undefined ? lat : prev.lat
        const nextLon = lon !== undefined ? lon : prev.lon
        const nextCommitted =
          options?.clearLocationCommit === true
            ? false
            : options?.userInitiated === true
              ? true
              : prev.locationCommittedByUser

        // Important: avoid creating a new object when nothing actually changed.
        // This prevents update loops in effects that call setLocation repeatedly.
        if (
          prev.displayName === nextDisplayName &&
          prev.lat === nextLat &&
          prev.lon === nextLon &&
          prev.locationCommittedByUser === nextCommitted
        ) {
          return prev
        }

        return {
          displayName: nextDisplayName,
          lat: nextLat,
          lon: nextLon,
          locationCommittedByUser: nextCommitted,
        }
      })
    },
    []
  )

  const hasCoords = location.lat != null && location.lon != null

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch {
      // ignore storage failures
    }
  }, [hydrated, location])

  return (
    <LocationContext.Provider value={{ location, setLocation, hasCoords, hydrated }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocationContext() {
  const ctx = useContext(LocationContext)
  if (!ctx) {
    throw new Error('useLocationContext must be used within LocationProvider')
  }
  return ctx
}
