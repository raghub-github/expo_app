'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'
import {
  getWebGeolocationPermission,
  watchWebGeolocationPermission,
  type WebGeolocationPermission,
} from '@/lib/webLocationPermission'
import { persistActiveLocationPin } from '@/lib/recentLocationStorage'

export type LocationSource = 'selected' | 'current' | null

export type LocationState = {
  displayName: string
  lat: number | null
  lon: number | null
  /**
   * True when we have a usable delivery pin (manual pick or auto GPS).
   * Pan-India browse uses `false` until location is available.
   */
  locationCommittedByUser?: boolean
  locationSource: LocationSource
}

const defaultState: LocationState = {
  displayName: 'India',
  lat: null,
  lon: null,
  locationCommittedByUser: false,
  locationSource: null,
}

/** User-selected pin — persisted (same idea as customer app AsyncStorage key). */
const SELECTED_STORAGE_KEY = 'gatimitra_last_selected_location_v1'
const LEGACY_STORAGE_KEY = 'gatimitra_location_v1'

type PersistedSelected = {
  displayName: string
  lat: number | null
  lon: number | null
  savedAt: number
}

export type SetLocationOptions = {
  userInitiated?: boolean
  clearLocationCommit?: boolean
  source?: LocationSource
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
  permissionStatus: WebGeolocationPermission
  locationLoading: boolean
  showPermissionModal: boolean
  setShowPermissionModal: (show: boolean) => void
  requestDeviceLocation: (options?: { force?: boolean }) => Promise<void>
  /** Call before user-gesture geolocation so failed attempts don't flash the permission modal. */
  markAutoDetectInFlight: (inFlight: boolean) => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

function persistSelectedLocation(state: LocationState) {
  if (state.locationSource !== 'selected') return
  try {
    const payload: PersistedSelected = {
      displayName: state.displayName,
      lat: state.lat,
      lon: state.lon,
      savedAt: Date.now(),
    }
    localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage failures
  }
}

function clearPersistedSelectedLocation() {
  try {
    localStorage.removeItem(SELECTED_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<LocationState>(defaultState)
  const [hydrated, setHydrated] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<WebGeolocationPermission>('undetermined')
  const [locationLoading, setLocationLoading] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const bootstrapStarted = useRef(false)
  const locationRef = useRef(location)
  const prevPermissionRef = useRef<WebGeolocationPermission>('undetermined')
  /** Prevents permission modal from re-opening during an in-flight user auto-detect. */
  const autoDetectInFlightRef = useRef(false)
  locationRef.current = location

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SELECTED_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedSelected>
        if (typeof parsed.displayName === 'string' && parsed.displayName.trim() !== '') {
          setLocationState({
            displayName: parsed.displayName.trim(),
            lat: typeof parsed.lat === 'number' ? parsed.lat : null,
            lon: typeof parsed.lon === 'number' ? parsed.lon : null,
            locationCommittedByUser: true,
            locationSource: 'selected',
          })
          setHydrated(true)
          return
        }
      }
      // Drop legacy blob — it often contained auto-GPS wrongly marked as committed.
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // ignore malformed persisted location
    } finally {
      setHydrated(true)
    }
  }, [])

  const setLocation = useCallback(
    (displayName: string, lat?: number | null, lon?: number | null, options?: SetLocationOptions) => {
      setLocationState((prev) => {
        if (options?.clearLocationCommit === true) {
          clearPersistedSelectedLocation()
          return { ...defaultState }
        }

        const source: LocationSource =
          options?.source ??
          (options?.userInitiated === true ? 'selected' : prev.locationSource)

        const nextDisplayName = displayName || prev.displayName
        const nextLat = lat !== undefined ? lat : prev.lat
        const nextLon = lon !== undefined ? lon : prev.lon
        const nextCommitted = source === 'selected'
        const nextSource = source

        if (
          prev.displayName === nextDisplayName &&
          prev.lat === nextLat &&
          prev.lon === nextLon &&
          prev.locationCommittedByUser === nextCommitted &&
          prev.locationSource === nextSource
        ) {
          return prev
        }

        const next: LocationState = {
          displayName: nextDisplayName,
          lat: nextLat,
          lon: nextLon,
          locationCommittedByUser: nextCommitted,
          locationSource: nextSource,
        }

        if (nextSource === 'selected') {
          persistSelectedLocation(next)
        }

        if (
          nextCommitted &&
          nextDisplayName.trim() &&
          nextDisplayName.trim().toLowerCase() !== 'india'
        ) {
          persistActiveLocationPin({
            displayName: nextDisplayName,
            lat: nextLat,
            lon: nextLon,
          })
        }

        return next
      })
    },
    []
  )

  const markAutoDetectInFlight = useCallback((inFlight: boolean) => {
    autoDetectInFlightRef.current = inFlight
  }, [])

  const showPermissionModalSafe = useCallback((show: boolean) => {
    if (show && autoDetectInFlightRef.current) return
    setShowPermissionModal(show)
  }, [])

  const requestDeviceLocation = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true
    const current = locationRef.current

    if (
      !force &&
      current.locationSource === 'selected' &&
      current.lat != null &&
      current.lon != null
    ) {
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (force) showPermissionModalSafe(true)
      return
    }

    setLocationLoading(true)
    markAutoDetectInFlight(true)
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords
              const { lat, lon } = normalizeLatLonForStorage(latitude, longitude)
              const res = await fetch(
                `/api/locations/reverse-geocode?${reverseGeocodeSearchParams(latitude, longitude)}`
              )
              const data = await res.json()
              const displayName =
                (typeof data?.displayName === 'string' && data.displayName.trim()) ||
                `${lat.toFixed(4)}, ${lon.toFixed(4)}`
              const area = typeof data?.area === 'string' ? data.area.trim() : ''
              const city = typeof data?.city === 'string' ? data.city.trim() : ''

              const next: LocationState = {
                displayName,
                lat,
                lon,
                locationCommittedByUser: true,
                locationSource: 'current',
              }
              setLocationState(next)
              // Persist so listings hydrate quickly; every visit still re-fetches GPS when granted.
              persistSelectedLocation({ ...next, locationSource: 'selected' })
              persistActiveLocationPin({
                displayName,
                lat,
                lon,
                area: area || undefined,
                city: city || undefined,
              })
              setPermissionStatus('granted')
              setShowPermissionModal(false)
              resolve()
            } catch (e) {
              reject(e)
            }
          },
          (error) => {
            if (error.code === 1) {
              setPermissionStatus('denied')
              // Stay pan-India until location is enabled.
              setLocationState({ ...defaultState })
              clearPersistedSelectedLocation()
              showPermissionModalSafe(true)
              resolve()
              return
            }
            reject(error)
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
      })
    } catch {
      if (force) showPermissionModalSafe(true)
    } finally {
      setLocationLoading(false)
      markAutoDetectInFlight(false)
    }
  }, [showPermissionModalSafe, markAutoDetectInFlight])

  useEffect(() => {
    if (!hydrated) return
    return watchWebGeolocationPermission(setPermissionStatus)
  }, [hydrated])

  /** After user enables location in browser site settings, detect automatically. */
  useEffect(() => {
    if (!hydrated) return
    const prev = prevPermissionRef.current
    prevPermissionRef.current = permissionStatus
    if (prev !== 'denied' || permissionStatus !== 'granted') return
    void requestDeviceLocation({ force: true })
  }, [hydrated, permissionStatus, requestDeviceLocation])

  /**
   * Every website visit:
   * - granted → always auto-fetch fresh GPS (stores filter by that location)
   * - denied → pan-India list + enable-location popup
   * - undetermined → pan-India until user allows via welcome / Auto-detect
   */
  useEffect(() => {
    if (!hydrated || bootstrapStarted.current) return
    bootstrapStarted.current = true

    void (async () => {
      const perm = await getWebGeolocationPermission()
      setPermissionStatus(perm)

      if (perm === 'granted') {
        await requestDeviceLocation({ force: true })
        return
      }

      if (perm === 'denied') {
        setLocationState({ ...defaultState })
        clearPersistedSelectedLocation()
        setShowPermissionModal(true)
      }
    })()
  }, [hydrated, requestDeviceLocation])

  const hasCoords = location.lat != null && location.lon != null

  return (
    <LocationContext.Provider
      value={{
        location,
        setLocation,
        hasCoords,
        hydrated,
        permissionStatus,
        locationLoading,
        showPermissionModal,
        setShowPermissionModal,
        requestDeviceLocation,
        markAutoDetectInFlight,
      }}
    >
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
