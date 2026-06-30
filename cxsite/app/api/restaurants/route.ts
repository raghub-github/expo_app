import { NextRequest, NextResponse } from 'next/server'
import { parseStoreTypeQueryParam } from '@/lib/merchantStoreTypes'
import {
  DEFAULT_SERVICE_RADIUS_KM,
} from '@/lib/server/merchantStoreGeo'
import {
  fetchGeoFilteredStores,
  fetchPanIndiaStores,
  type WebRestaurantRow,
} from '@/lib/server/fetchMerchantStores'

const MAX_RADIUS_KM = 50

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'
function log(...args: unknown[]) {
  if (DEBUG) console.log('[GET /api/restaurants]', new Date().toISOString(), ...args)
}

function applyStoreTypeFilter(
  rows: WebRestaurantRow[],
  storeTypeFilter: ReturnType<typeof parseStoreTypeQueryParam>
): WebRestaurantRow[] {
  if (storeTypeFilter.mode === 'all') return rows
  if (storeTypeFilter.mode === 'is_null') {
    return rows.filter((r) => r.store_type == null)
  }
  return rows.filter((r) => r.store_type === storeTypeFilter.value)
}

/**
 * GET /api/restaurants
 * - No lat/lon (or pan-India browse): all approved active stores (cap 500).
 * - lat + lon: same nearby RPC as customer app (`get_nearby_merchant_stores`).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeTypeFilter = parseStoreTypeQueryParam(searchParams.get('store_type'))
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon')
    const radiusKm = Math.min(
      MAX_RADIUS_KM,
      Math.max(
        1,
        parseInt(searchParams.get('radius_km') ?? String(DEFAULT_SERVICE_RADIUS_KM), 10) ||
          DEFAULT_SERVICE_RADIUS_KM
      )
    )

    const userLat = latParam != null ? parseFloat(latParam) : NaN
    const userLon = lonParam != null ? parseFloat(lonParam) : NaN
    const hasValidCoords =
      !Number.isNaN(userLat) &&
      !Number.isNaN(userLon) &&
      userLat >= -90 &&
      userLat <= 90 &&
      userLon >= -180 &&
      userLon <= 180

    if (hasValidCoords) {
      const mapped = applyStoreTypeFilter(
        await fetchGeoFilteredStores(userLat, userLon, radiusKm),
        storeTypeFilter
      )
      log('Geo filter at', userLat, userLon, '→', mapped.length, 'stores')
      return NextResponse.json(mapped)
    }

    log('Pan-India: approved active stores')
    const mapped = applyStoreTypeFilter(await fetchPanIndiaStores(), storeTypeFilter)
    log('Returning', mapped.length, 'restaurants (pan-India)')
    return NextResponse.json(mapped)
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
