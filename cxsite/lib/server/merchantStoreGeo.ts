/**
 * Geo + service rules for merchant_stores (food delivery).
 * User position vs store position; each store may cap range via delivery_radius_km.
 */

export const DEFAULT_SERVICE_RADIUS_KM = 10

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

/**
 * Effective max distance from user to store: min(global cap, store's delivery_radius_km when set).
 * If store has no delivery_radius_km, only the global cap applies.
 */
export function effectiveMaxKm(globalCapKm: number, deliveryRadiusKm: number | null | undefined): number {
  if (deliveryRadiusKm == null || Number.isNaN(Number(deliveryRadiusKm))) {
    return globalCapKm
  }
  const v = Number(deliveryRadiusKm)
  if (v <= 0) return globalCapKm
  return Math.min(globalCapKm, v)
}

export function isUserWithinStoreRange(
  userLat: number,
  userLon: number,
  storeLat: number,
  storeLon: number,
  globalCapKm: number,
  deliveryRadiusKm: number | null | undefined
): boolean {
  const d = haversineKm(userLat, userLon, storeLat, storeLon)
  return d <= effectiveMaxKm(globalCapKm, deliveryRadiusKm)
}

export type StoreGeoRow = {
  latitude?: number | null
  longitude?: number | null
  delivery_radius_km?: number | string | null
}

/** Filter rows when user coords are known; drops rows without lat/lon. */
export function filterStoreRowsByUserGeo<T extends StoreGeoRow>(
  rows: T[] | null | undefined,
  userLat: number,
  userLon: number,
  globalRadiusKm: number
): T[] {
  if (!rows?.length) return []
  const out: T[] = []
  for (const row of rows) {
    const lat = row.latitude
    const lon = row.longitude
    if (lat == null || lon == null) continue
    if (
      isUserWithinStoreRange(
        userLat,
        userLon,
        Number(lat),
        Number(lon),
        globalRadiusKm,
        row.delivery_radius_km != null ? Number(row.delivery_radius_km) : null
      )
    ) {
      out.push(row)
    }
  }
  return out
}
