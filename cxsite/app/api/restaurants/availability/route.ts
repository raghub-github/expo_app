import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_SERVICE_RADIUS_KM,
  filterStoreRowsByUserGeo,
} from '@/lib/server/merchantStoreGeo'

const MAX_RADIUS_KM = 50
const BBOX_DEGREE_APPROX = 0.1

/**
 * GET /api/restaurants/availability?lat=&lon=&radius_km=10
 * Any approved active store (open OR closed operational)
 * within min(radius_km, delivery_radius_km) of user?
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon')
    const radiusKm = Math.min(
      MAX_RADIUS_KM,
      Math.max(1, parseInt(searchParams.get('radius_km') ?? String(DEFAULT_SERVICE_RADIUS_KM), 10) || DEFAULT_SERVICE_RADIUS_KM)
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

    const delta = BBOX_DEGREE_APPROX * (radiusKm / 10)
    const latMin = userLat - delta
    const latMax = userLat + delta
    const lonMin = userLon - delta
    const lonMax = userLon + delta

    const { data: storesData, error: storesError } = await supabase
      .from('merchant_stores')
      .select('latitude, longitude, delivery_radius_km')
      .eq('is_active', true)
      .eq('status', 'ACTIVE')
      .eq('approval_status', 'APPROVED')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', latMin)
      .lte('latitude', latMax)
      .gte('longitude', lonMin)
      .lte('longitude', lonMax)

    if (storesError) {
      return NextResponse.json(
        { error: 'Failed to fetch stores', details: storesError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const filtered = filterStoreRowsByUserGeo(storesData ?? [], userLat, userLon, radiusKm)
    const count = filtered.length
    const available = count > 0
    const res = NextResponse.json({
      available,
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
