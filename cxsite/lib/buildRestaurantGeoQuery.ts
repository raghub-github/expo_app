import type { LocationState } from '@/components/providers/LocationProvider'
import { isPanIndiaLocationDisplay } from '@/lib/panIndiaLocation'

/** Append to /api/restaurants or /api/restaurants/by-category when user committed coords. */
export function getRestaurantGeoQueryString(
  location: LocationState,
  locationCommittedByUser: boolean
): string {
  if (!locationCommittedByUser || location.lat == null || location.lon == null) return ''
  const p = new URLSearchParams()
  p.set('lat', String(location.lat))
  p.set('lon', String(location.lon))
  p.set('radius_km', '10')
  return p.toString()
}

/**
 * Home `/api/brands`: filter by radius when the user picked a real place (not pan‑India placeholder).
 * Omits 0,0 sentinels (no real coordinates).
 */
export function getBrandsGeoQueryString(location: LocationState): string {
  if (location.locationCommittedByUser !== true) return ''
  if (isPanIndiaLocationDisplay(location.displayName)) return ''
  const lat = location.lat
  const lon = location.lon
  if (lat == null || lon == null) return ''
  if (lat === 0 && lon === 0) return ''
  const p = new URLSearchParams()
  p.set('lat', String(lat))
  p.set('lon', String(lon))
  p.set('radius_km', '10')
  return p.toString()
}
