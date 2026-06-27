import type { LocationState } from '@/components/providers/LocationProvider'

export function hasValidCoords(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false
  if (lat === 0 && lon === 0) return false
  return true
}

export function buildLocationQueryFromState(location: LocationState): URLSearchParams {
  const p = new URLSearchParams()
  if (location.displayName && location.displayName.trim() !== '') {
    p.set('location', location.displayName)
  }
  if (hasValidCoords(location.lat, location.lon)) {
    p.set('lat', String(location.lat))
    p.set('lon', String(location.lon))
  }
  return p
}

export function mergeLocationQuery(
  base: URLSearchParams,
  locationQuery: URLSearchParams
): URLSearchParams {
  const out = new URLSearchParams(base.toString())
  locationQuery.forEach((value, key) => out.set(key, value))
  return out
}
