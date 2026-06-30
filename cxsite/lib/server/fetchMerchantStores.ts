import { supabase } from '@/lib/supabase'
import { previewEtaRange } from '@/lib/etaPreview'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import {
  DEFAULT_SERVICE_RADIUS_KM,
  filterStoreRowsByUserGeo,
  haversineKm,
} from '@/lib/server/merchantStoreGeo'

const PAN_INDIA_CAP = 500
const BBOX_DEGREE_APPROX = 0.1

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

export type WebRestaurantRow = {
  id: number
  store_id: string
  restaurant_id: string
  restaurant_name: string
  name: string
  address: string
  full_address: string
  landmark: string | null
  city: string
  state: string
  image_url: string | null
  store_img: string | null
  cuisine_type: string
  cuisine_types: string[] | null
  is_veg: boolean
  is_pure_veg: boolean
  avg_rating: number | null
  total_reviews: number | null
  delivery_time_minutes: number | null
  delivery_time: string
  eta_min_minutes: number
  eta_max_minutes: number
  delivery_fee: number | null
  min_order_amount: number
  discount: string | null
  fssai_license: string | null
  category: string | null
  is_active: boolean
  is_accepting_orders: boolean
  opening_time: string | null
  closing_time: string | null
  status: string | undefined
  approval_status: string | undefined
  operational_status: string | null
  store_type: string | null
  latitude: number | null
  longitude: number | null
  distance_km: number | null
}

function mapStoreToRestaurant(
  row: Record<string, unknown>,
  distanceKm: number | null | undefined
): WebRestaurantRow {
  const img = toAbsoluteImageUrl((row.banner_url as string | null) ?? null)
  const name = String(row.store_display_name ?? row.store_name ?? '')
  const cuisineTypes = (row.cuisine_types as string[] | null) ?? []
  const cuisineType =
    cuisineTypes.length > 0 ? cuisineTypes.join(', ') : ''
  const prep = row.avg_preparation_time_minutes as number | null | undefined
  const distance =
    distanceKm != null && Number.isFinite(Number(distanceKm))
      ? Number(distanceKm)
      : null
  const eta = previewEtaRange({
    distanceKm: distance,
    prepMinutes: prep,
  })

  return {
    id: Number(row.id),
    store_id: String(row.store_id ?? ''),
    restaurant_id: String(row.store_id ?? ''),
    restaurant_name: name,
    name,
    address: String(row.full_address ?? ''),
    full_address: String(row.full_address ?? ''),
    landmark: (row.landmark as string | null) ?? null,
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    image_url: img,
    store_img: img,
    cuisine_type: cuisineType,
    cuisine_types: cuisineTypes,
    is_veg: Boolean(row.is_pure_veg),
    is_pure_veg: Boolean(row.is_pure_veg),
    avg_rating: null,
    total_reviews: null,
    delivery_time_minutes: eta.etaMinMinutes,
    delivery_time: `${eta.etaMinMinutes}-${eta.etaMaxMinutes} min`,
    eta_min_minutes: eta.etaMinMinutes,
    eta_max_minutes: eta.etaMaxMinutes,
    delivery_fee: null,
    min_order_amount: Number(row.min_order_amount ?? 0),
    discount: null,
    fssai_license: null,
    category: cuisineTypes[0] ?? null,
    is_active: Boolean(row.is_active),
    is_accepting_orders: Boolean(row.is_accepting_orders),
    opening_time: null,
    closing_time: null,
    status: row.status as string | undefined,
    approval_status: row.approval_status as string | undefined,
    operational_status: (row.operational_status as string | null) ?? null,
    store_type: (row.store_type as string | null) ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    distance_km: distance,
  }
}

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/** Same RPC as customer app backend — haversine nearby stores. */
async function fetchNearbyViaRpc(
  userLat: number,
  userLon: number,
  radiusKm: number
): Promise<WebRestaurantRow[] | null> {
  const db = getDb()
  const { data, error } = await db.rpc('get_nearby_merchant_stores', {
    user_lat: userLat,
    user_lng: userLon,
    radius_km: radiusKm,
    max_limit: 50,
    veg_mode: false,
  })

  if (error) {
    console.warn('[fetchMerchantStores] RPC failed:', error.message)
    return null
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  return rows.map((row) =>
    mapStoreToRestaurant(row, row.distance_km as number | null)
  )
}

async function fetchNearbyViaBbox(
  userLat: number,
  userLon: number,
  radiusKm: number
): Promise<WebRestaurantRow[]> {
  const delta = BBOX_DEGREE_APPROX * (radiusKm / 10)
  const { data, error } = await getDb()
    .from('merchant_stores')
    .select(STORE_SELECT)
    .eq('is_active', true)
    .eq('status', 'ACTIVE')
    .eq('approval_status', 'APPROVED')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', userLat - delta)
    .lte('latitude', userLat + delta)
    .gte('longitude', userLon - delta)
    .lte('longitude', userLon + delta)
    .order('store_name', { ascending: true })
    .limit(1000)

  if (error) throw error

  const filtered = filterStoreRowsByUserGeo(data ?? [], userLat, userLon, radiusKm)
  return filtered.map((row: Record<string, unknown>) => {
    const lat = Number(row.latitude)
    const lon = Number(row.longitude)
    const distance_km =
      Number.isFinite(lat) && Number.isFinite(lon)
        ? Math.round(haversineKm(userLat, userLon, lat, lon) * 10) / 10
        : null
    return mapStoreToRestaurant(row, distance_km)
  })
}

export async function fetchPanIndiaStores(): Promise<WebRestaurantRow[]> {
  const { data, error } = await getDb()
    .from('merchant_stores')
    .select(STORE_SELECT)
    .eq('is_active', true)
    .eq('status', 'ACTIVE')
    .eq('approval_status', 'APPROVED')
    .order('store_name', { ascending: true })
    .limit(PAN_INDIA_CAP)

  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) =>
    mapStoreToRestaurant(row, null)
  )
}

export async function fetchGeoFilteredStores(
  userLat: number,
  userLon: number,
  radiusKm: number = DEFAULT_SERVICE_RADIUS_KM
): Promise<WebRestaurantRow[]> {
  const viaRpc = await fetchNearbyViaRpc(userLat, userLon, radiusKm)
  if (viaRpc != null) return viaRpc
  return fetchNearbyViaBbox(userLat, userLon, radiusKm)
}
