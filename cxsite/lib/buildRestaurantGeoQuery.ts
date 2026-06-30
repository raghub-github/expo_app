import type { LocationState } from '@/components/providers/LocationProvider'
import { isPanIndiaBrowsingMode } from '@/lib/panIndiaLocation'
import { DEFAULT_SERVICE_RADIUS_KM } from '@/lib/server/merchantStoreGeo'

/** Append to /api/restaurants when user committed a real delivery address with coords. */
export function getRestaurantGeoQueryString(location: LocationState): string {
  if (isPanIndiaBrowsingMode(location)) return ''
  const lat = location.lat
  const lon = location.lon
  if (lat == null || lon == null) return ''
  if (lat === 0 && lon === 0) return ''
  const p = new URLSearchParams()
  p.set('lat', String(lat))
  p.set('lon', String(lon))
  p.set('radius_km', String(DEFAULT_SERVICE_RADIUS_KM))
  return p.toString()
}

/**
 * Home `/api/brands`: filter by radius when the user picked a real place (not pan‑India placeholder).
 * Omits 0,0 sentinels (no real coordinates).
 */
export function getBrandsGeoQueryString(location: LocationState): string {
  if (isPanIndiaBrowsingMode(location)) return ''
  const lat = location.lat
  const lon = location.lon
  if (lat == null || lon == null) return ''
  if (lat === 0 && lon === 0) return ''
  const p = new URLSearchParams()
  p.set('lat', String(lat))
  p.set('lon', String(lon))
  p.set('radius_km', String(DEFAULT_SERVICE_RADIUS_KM))
  return p.toString()
}
