import { normalizeLatLonForStorage, reverseGeocodeSearchParams } from '@/lib/normalizeLatLon'

export type DetectCurrentLocationResult =
  | {
      ok: true
      displayName: string
      lat: number
      lon: number
      city?: string
      area?: string
    }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error' }

/**
 * Must be started synchronously from a user click/tap handler so the browser shows
 * the native “Allow location?” prompt (Magicpin-style).
 */
export function detectCurrentLocation(): Promise<DetectCurrentLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
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
            resolve({
              ok: true,
              displayName,
              lat,
              lon,
              city: typeof data?.city === 'string' ? data.city : undefined,
              area: typeof data?.area === 'string' ? data.area : undefined,
            })
          } catch {
            resolve({ ok: false, reason: 'error' })
          }
        })()
      },
      (error) => {
        resolve({ ok: false, reason: error.code === 1 ? 'denied' : 'error' })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}
