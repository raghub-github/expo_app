import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseStoreTypeQueryParam } from '@/lib/merchantStoreTypes'
import {
  DEFAULT_SERVICE_RADIUS_KM,
  filterStoreRowsByUserGeo,
  haversineKm,
} from '@/lib/server/merchantStoreGeo'

/** Map merchant_stores row to the shape expected by Header, RestaurantListPage, etc. */
function mapStoreToRestaurant(row: {
  id: number
  store_id: string
  parent_id: number
  store_name: string
  store_display_name: string | null
  full_address: string
  landmark: string | null
  city: string
  state: string
  banner_url?: string | null
  cuisine_types: string[] | null
  is_pure_veg: boolean | null
  avg_preparation_time_minutes: number | null
  min_order_amount: number | null
  is_active: boolean | null
  is_accepting_orders: boolean | null
  status?: string
  approval_status?: string
  operational_status?: string
  store_type?: string | null
  latitude?: number | null
  longitude?: number | null
  distance_km?: number | null
}) {
  const img = row.banner_url ?? null
  const name = row.store_display_name || row.store_name
  const cuisineType = Array.isArray(row.cuisine_types) && row.cuisine_types.length > 0
    ? row.cuisine_types.join(', ')
    : ''
  return {
    id: row.id,
    store_id: row.store_id,
    restaurant_id: row.store_id,
    restaurant_name: name,
    name,
    address: row.full_address,
    full_address: row.full_address,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    image_url: img,
    store_img: img,
    cuisine_type: cuisineType,
    cuisine_types: row.cuisine_types,
    is_veg: row.is_pure_veg ?? false,
    is_pure_veg: row.is_pure_veg ?? false,
    avg_rating: null as number | null,
    total_reviews: null as number | null,
    delivery_time_minutes: row.avg_preparation_time_minutes ?? null,
    delivery_fee: null as number | null,
    min_order_amount: row.min_order_amount ?? 0,
    discount: null as string | null,
    fssai_license: null as string | null,
    category: (row.cuisine_types && row.cuisine_types[0]) ?? null,
    is_active: row.is_active ?? false,
    is_accepting_orders: row.is_accepting_orders ?? false,
    opening_time: null as string | null,
    closing_time: null as string | null,
    status: row.status,
    approval_status: row.approval_status,
    operational_status: row.operational_status ?? null,
    store_type: row.store_type ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    distance_km: row.distance_km ?? null,
  }
}

const STORE_SELECT = `
  id,
  store_id,
  parent_id,
  store_name,
  store_display_name,
  full_address,
  landmark,
  city,
  state,
  banner_url,
  cuisine_types,
  is_pure_veg,
  avg_preparation_time_minutes,
  min_order_amount,
  is_active,
  is_available,
  is_accepting_orders,
  status,
  approval_status,
  operational_status,
  store_type,
  latitude,
  longitude,
  delivery_radius_km
`

const BBOX_DEGREE_APPROX = 0.1
const MAX_RADIUS_KM = 50

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'
function log(...args: unknown[]) {
  if (DEBUG) console.log('[GET /api/restaurants]', new Date().toISOString(), ...args)
}

/**
 * GET /api/restaurants
 * - Rows must be is_active, status ACTIVE, approval APPROVED (operational OPEN/CLOSED both listed).
 * - No lat/lon: pan-India — all matching stores (no geo filter; includes stores missing coords).
 * - lat, lon (+ optional radius_km): only stores whose location can serve the user (cap × delivery_radius_km).
 * - store_type: optional. Omit or ALL = all types; NULL = rows where store_type IS NULL; else exact enum (e.g. RESTAURANT).
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
      const delta = BBOX_DEGREE_APPROX * (radiusKm / 10)
      const latMin = userLat - delta
      const latMax = userLat + delta
      const lonMin = userLon - delta
      const lonMax = userLon + delta

      let geoQuery = supabase
        .from('merchant_stores')
        .select(STORE_SELECT)
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', latMin)
        .lte('latitude', latMax)
        .gte('longitude', lonMin)
        .lte('longitude', lonMax)
      if (storeTypeFilter.mode === 'is_null') geoQuery = geoQuery.is('store_type', null)
      else if (storeTypeFilter.mode === 'eq') geoQuery = geoQuery.eq('store_type', storeTypeFilter.value)
      const { data, error } = await geoQuery.order('store_name', { ascending: true })

      if (error) {
        log('Supabase error:', error.message, error)
        return NextResponse.json(
          { error: 'Failed to fetch restaurants', details: error.message },
          { status: 500 }
        )
      }

      const filtered = filterStoreRowsByUserGeo(data ?? [], userLat, userLon, radiusKm)
      const mapped = filtered.map((row: Record<string, unknown>) => {
        const r = row as Parameters<typeof mapStoreToRestaurant>[0] & {
          latitude?: number | null
          longitude?: number | null
        }
        let distance_km: number | null = null
        if (r.latitude != null && r.longitude != null) {
          distance_km = Math.round(haversineKm(userLat, userLon, Number(r.latitude), Number(r.longitude)) * 10) / 10
        }
        return mapStoreToRestaurant({ ...r, distance_km })
      })
      log('Geo filter:', (data ?? []).length, 'bbox →', filtered.length, 'within range')
      return NextResponse.json(mapped)
    }

    log('Pan-India: approved active stores (open + closed operational)')
    let panQuery = supabase
      .from('merchant_stores')
      .select(STORE_SELECT)
      .eq('is_active', true)
      .eq('status', 'ACTIVE')
      .eq('approval_status', 'APPROVED')
    if (storeTypeFilter.mode === 'is_null') panQuery = panQuery.is('store_type', null)
    else if (storeTypeFilter.mode === 'eq') panQuery = panQuery.eq('store_type', storeTypeFilter.value)
    const { data, error } = await panQuery.order('store_name', { ascending: true })

    if (error) {
      log('Supabase error:', error.message, error)
      return NextResponse.json(
        { error: 'Failed to fetch restaurants', details: error.message },
        { status: 500 }
      )
    }

    const mapped = (data || []).map((row: Record<string, unknown>) =>
      mapStoreToRestaurant(row as Parameters<typeof mapStoreToRestaurant>[0])
    )
    log('Returning', mapped.length, 'restaurants (pan-India)')
    return NextResponse.json(mapped)
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
