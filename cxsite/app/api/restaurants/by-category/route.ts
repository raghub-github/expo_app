import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import {
  DEFAULT_SERVICE_RADIUS_KM,
  filterStoreRowsByUserGeo,
  haversineKm,
} from '@/lib/server/merchantStoreGeo'

export const dynamic = 'force-dynamic'

const MAX_RADIUS_KM = 50

type Geo = { userLat: number; userLon: number; radiusKm: number }

function parseGeo(searchParams: URLSearchParams): Geo | null {
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
  if (
    Number.isNaN(userLat) ||
    Number.isNaN(userLon) ||
    userLat < -90 ||
    userLat > 90 ||
    userLon < -180 ||
    userLon > 180
  ) {
    return null
  }
  return { userLat, userLon, radiusKm }
}

/** Map merchant_stores row to the shape expected by RestaurantListPage (same as main route). */
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
  latitude?: number | null
  longitude?: number | null
  distance_km?: number | null
}) {
  const img = toAbsoluteImageUrl(row.banner_url ?? null)
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
    image_url: img,
    store_img: img,
    cuisine_type: cuisineType,
    is_veg: row.is_pure_veg ?? false,
    avg_rating: null as number | null,
    total_reviews: null as number | null,
    delivery_time_minutes: row.avg_preparation_time_minutes ?? null,
    delivery_fee: null as number | null,
    min_order_amount: row.min_order_amount ?? 0,
    discount: null as string | null,
    fssai_license: null as string | null,
    category: (row.cuisine_types && row.cuisine_types[0]) ?? null,
    is_active: row.is_active ?? false,
    opening_time: null as string | null,
    closing_time: null as string | null,
    approval_status: row.approval_status,
    operational_status: row.operational_status ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    distance_km: row.distance_km ?? null,
  }
}

const storeSelect = `
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
  latitude,
  longitude,
  delivery_radius_km
`

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'
function log(...args: unknown[]) {
  if (DEBUG) console.log('[GET /api/restaurants/by-category]', new Date().toISOString(), ...args)
}

function scoreText(text: string | null | undefined, q: string): number {
  if (!text || !q) return 0
  const t = text.toLowerCase()
  const qLower = q.toLowerCase()
  if (t === qLower) return 100
  if (t.startsWith(qLower)) return 85
  if (t.includes(qLower)) return 65
  return 0
}

// GET /api/restaurants/by-category?category=Biryani
// Optional: lat, lon, radius_km — filter to stores that can serve that point.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')?.trim()
    const geo = parseGeo(searchParams)

    log('category param:', category, 'geo:', geo)
    if (!category) {
      log('Missing category, returning 400')
      return NextResponse.json({ error: 'Missing category parameter' }, { status: 400 })
    }

    const safeCategory = category.replace(/[%_\\]/g, ' ').trim()
    log('safeCategory:', safeCategory)

    const mapRows = (storesData: Record<string, unknown>[] | null) => {
      if (!storesData?.length) return []
      const rows = geo
        ? filterStoreRowsByUserGeo(
            storesData as Parameters<typeof filterStoreRowsByUserGeo>[0],
            geo.userLat,
            geo.userLon,
            geo.radiusKm
          )
        : storesData
      return rows.map((row) => {
        const r = row as Parameters<typeof mapStoreToRestaurant>[0] & {
          latitude?: number | null
          longitude?: number | null
        }
        let distance_km: number | null = null
        if (geo && r.latitude != null && r.longitude != null) {
          distance_km =
            Math.round(haversineKm(geo.userLat, geo.userLon, Number(r.latitude), Number(r.longitude)) * 10) / 10
        }
        return mapStoreToRestaurant({ ...r, distance_km })
      })
    }

    const fetchStoresByIds = async (ids: Array<number | string>) => {
      if (ids.length === 0) return []
      const numericIds = ids
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
      const stringIds = ids.map((v) => String(v))

      if (numericIds.length > 0) {
        const byId = await supabase
          .from('merchant_stores')
          .select(storeSelect)
          .in('id', numericIds)
          .eq('is_active', true)
          .eq('status', 'ACTIVE')
          .eq('approval_status', 'APPROVED')
          .order('store_name', { ascending: true })
        if (!byId.error && byId.data && byId.data.length > 0) return byId.data
      }

      const byStoreId = await supabase
        .from('merchant_stores')
        .select(storeSelect)
        .in('store_id', stringIds)
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .order('store_name', { ascending: true })
      if (byStoreId.error) return null
      return byStoreId.data || []
    }

    const storeScore = new Map<string, number>()
    const upsertScore = (storeId: string | number | null | undefined, score: number) => {
      const key = String(storeId ?? '').trim()
      if (!key || score <= 0) return
      const prev = storeScore.get(key) ?? 0
      if (score > prev) storeScore.set(key, score)
    }

    // 1) Category-name relevance
    const catRes = await supabase
      .from('merchant_menu_categories')
      .select('id, store_id, category_name')
      .eq('is_active', true)
      .ilike('category_name', `%${safeCategory}%`)
      .limit(500)

    if (catRes.error) {
      log('merchant_menu_categories error:', catRes.error.message)
      return NextResponse.json(
        { error: 'Failed to fetch menu categories', details: catRes.error.message },
        { status: 500 }
      )
    }

    const matchedCategoryIds = new Set<number>()
    for (const row of catRes.data || []) {
      const sc = scoreText((row as { category_name?: string }).category_name, category)
      if (sc > 0) {
        matchedCategoryIds.add(Number((row as { id?: number }).id))
        upsertScore((row as { store_id?: string | number }).store_id, sc)
      }
    }

    // 2) Menu-item relevance (item_name/category/category_item)
    let itemRes = await supabase
      .from('merchant_menu_items')
      .select('store_id, item_name, category, category_item, category_id')
      .eq('is_active', true)
      .or(`item_name.ilike.%${safeCategory}%,category.ilike.%${safeCategory}%,category_item.ilike.%${safeCategory}%`)
      .limit(1200)

    if (itemRes.error) {
      // Fallback for schemas where category/category_item are unavailable.
      itemRes = await supabase
        .from('merchant_menu_items')
        .select('store_id, item_name, category_id')
        .eq('is_active', true)
        .ilike('item_name', `%${safeCategory}%`)
        .limit(1200)
    }

    for (const row of itemRes.data || []) {
      const r = row as {
        store_id?: string | number
        item_name?: string
        category?: string
        category_item?: string
        category_id?: number
      }
      const base = Math.max(
        scoreText(r.item_name, category),
        scoreText(r.category, category),
        scoreText(r.category_item, category)
      )
      const catBoost =
        r.category_id != null && matchedCategoryIds.has(Number(r.category_id)) ? 10 : 0
      upsertScore(r.store_id, base + catBoost)
    }

    // 3) Ensure exact category-id matches are always included (high relevance)
    if (matchedCategoryIds.size > 0) {
      const byCategoryIdRes = await supabase
        .from('merchant_menu_items')
        .select('store_id')
        .in('category_id', Array.from(matchedCategoryIds))
        .eq('is_active', true)
        .limit(1200)
      for (const row of byCategoryIdRes.data || []) {
        upsertScore((row as { store_id?: string | number }).store_id, 95)
      }
    }

    const rankedStoreIds = Array.from(storeScore.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)

    if (rankedStoreIds.length === 0) {
      log('No matched stores for category:', category)
      return NextResponse.json([])
    }

    const storesData = await fetchStoresByIds(rankedStoreIds)
    if (!storesData || storesData.length === 0) return NextResponse.json([])

    // Preserve score ordering after fetching store rows.
    const rankIndex = new Map(rankedStoreIds.map((id, idx) => [id, idx]))
    const orderedStores = [...storesData].sort((a: any, b: any) => {
      const aKey = String(a?.store_id ?? a?.id ?? '')
      const bKey = String(b?.store_id ?? b?.id ?? '')
      return (rankIndex.get(aKey) ?? Number.MAX_SAFE_INTEGER) - (rankIndex.get(bKey) ?? Number.MAX_SAFE_INTEGER)
    })

    const mapped = mapRows(orderedStores as Record<string, unknown>[])
    log('Returning', mapped.length, 'stores from scored category match')
    return NextResponse.json(mapped)
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
