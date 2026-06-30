import type { LocationState } from '@/components/providers/LocationProvider'

function isPincode(value?: string | null): boolean {
  return !!value && /^\d{6}$/.test(value.trim())
}

/** Pincode / coords for GET /api/geo/services — mirrors customer app geo hints. */
export function extractWebGeoHints(location: LocationState): {
  pincode: string | null
  state: string | null
  lat: number | null
  lng: number | null
} {
  const parts = (location.displayName ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  const pincode = parts.find((p) => isPincode(p)) ?? null

  const state =
    [...parts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== 'india') ?? null

  const lat =
    location.lat != null && Number.isFinite(location.lat) ? location.lat : null
  const lng =
    location.lon != null && Number.isFinite(location.lon) ? location.lon : null

  return { pincode, state, lat, lng }
}
