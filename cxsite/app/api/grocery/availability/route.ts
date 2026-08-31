import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_SERVICE_RADIUS_KM } from '@/lib/server/merchantStoreGeo'
import {
  enrichStoreListMeta,
  fetchGeoFilteredStores,
  fetchPanIndiaStores,
} from '@/lib/server/fetchMerchantStores'

export const dynamic = 'force-dynamic'

function parseCoords(searchParams: URLSearchParams) {
  const latParam = searchParams.get('lat')
  const lonParam = searchParams.get('lon') ?? searchParams.get('lng')
  const userLat = latParam != null ? parseFloat(latParam) : NaN
  const userLon = lonParam != null ? parseFloat(lonParam) : NaN
  const hasCoords =
    Number.isFinite(userLat) &&
    Number.isFinite(userLon) &&
    userLat >= -90 &&
    userLat <= 90 &&
    userLon >= -180 &&
    userLon <= 180
  return { userLat, userLon, hasCoords }
}

function countGroceryStores(
  rows: Awaited<ReturnType<typeof fetchGeoFilteredStores>>
): number {
  return rows.filter(
    (r) => String(r.store_type ?? '').toUpperCase() === 'GROCERY' && !!r.public_slug?.trim()
  ).length
}

/**
 * Lightweight grocery presence check — same nearby geo as /api/restaurants.
 * GET /api/grocery/availability?lat=&lon= (or lng=)&radius_km=
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const radiusKm = Math.min(
      50,
      Math.max(
        1,
        parseInt(searchParams.get('radius_km') ?? String(DEFAULT_SERVICE_RADIUS_KM), 10) ||
          DEFAULT_SERVICE_RADIUS_KM
      )
    )
    const { userLat, userLon, hasCoords } = parseCoords(searchParams)

    let rows: Awaited<ReturnType<typeof fetchGeoFilteredStores>>
    if (hasCoords) {
      rows = await enrichStoreListMeta(
        await fetchGeoFilteredStores(userLat, userLon, radiusKm)
      )
    } else {
      rows = (await fetchPanIndiaStores()).filter(
        (r) => String(r.store_type ?? '').toUpperCase() === 'GROCERY' && !!r.public_slug?.trim()
      )
      const n = rows.length
      return NextResponse.json(
        { available: n > 0, count: n },
        { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } }
      )
    }

    const n = countGroceryStores(rows)
    return NextResponse.json(
      { available: n > 0, count: n },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } }
    )
  } catch {
    return NextResponse.json({ available: false, count: 0 }, { status: 200 })
  }
}
