import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_SERVICE_RADIUS_KM } from '@/lib/server/merchantStoreGeo'
import { fetchGeoFilteredStores } from '@/lib/server/fetchMerchantStores'

export const dynamic = 'force-dynamic'

const MAX_RADIUS_KM = 50

/**
 * GET /api/restaurants/availability?lat=&lon=&radius_km=15
 * Uses the same geo filter as GET /api/restaurants (RPC + service-role fallback).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
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

    if (!hasValidCoords) {
      return NextResponse.json(
        { error: 'Valid lat and lon required', available: false, count: 0 },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const stores = await fetchGeoFilteredStores(userLat, userLon, radiusKm)
    const count = stores.length
    const res = NextResponse.json({
      available: count > 0,
      count,
      radius_km: radiusKm,
    })
    res.headers.set('Cache-Control', 'no-store, max-age=0')
    return res
  } catch (err) {
    console.error('[GET /api/restaurants/availability]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
