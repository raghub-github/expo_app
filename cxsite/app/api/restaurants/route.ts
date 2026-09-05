import { NextRequest, NextResponse } from 'next/server'
import {
  applyListingVerticalFilter,
  parseListingQueryParam,
  parseStoreTypeQueryParam,
} from '@/lib/merchantStoreTypes'
import {
  DEFAULT_SERVICE_RADIUS_KM,
} from '@/lib/server/merchantStoreGeo'
import {
  enrichStoreListMeta,
  fetchGeoFilteredStores,
  fetchPanIndiaStores,
  type WebRestaurantRow,
} from '@/lib/server/fetchMerchantStores'
import { attachPublicSlugsToListRows } from '@/lib/server/attachPublicSlugsToListRows'
import { sanitizePublicStoreListRow } from '@/lib/server/sanitizePublicStoreResponse'

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

async function withPublicSlugs(rows: WebRestaurantRow[]): Promise<WebRestaurantRow[]> {
  const enriched = await enrichStoreListMeta(rows)
  return attachPublicSlugsToListRows(enriched)
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
    const listing = parseListingQueryParam(searchParams.get('listing'))
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon') ?? searchParams.get('lng')
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
      let rows = await fetchGeoFilteredStores(userLat, userLon, radiusKm)
      rows = await withPublicSlugs(rows)
      const mapped = applyListingVerticalFilter(applyStoreTypeFilter(rows, storeTypeFilter), listing)
      log('Geo filter at', userLat, userLon, '→', mapped.length, 'stores')
      return NextResponse.json(mapped.map((r) => sanitizePublicStoreListRow(r as unknown as Record<string, unknown>)))
    }

    log('Pan-India: approved active stores')
    const mapped = applyListingVerticalFilter(
      applyStoreTypeFilter(await withPublicSlugs(await fetchPanIndiaStores()), storeTypeFilter),
      listing
    )
    log('Returning', mapped.length, 'restaurants (pan-India)')
    return NextResponse.json(mapped.map((r) => sanitizePublicStoreListRow(r as unknown as Record<string, unknown>)))
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
