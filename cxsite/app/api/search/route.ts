import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SERVICE_RADIUS_KM, filterStoreRowsByUserGeo } from '@/lib/server/merchantStoreGeo'

const MAX_ITEMS = 20
const MAX_RESTAURANTS = 10
const MAX_RADIUS_KM = 50
const BBOX_DEGREE_APPROX = 0.1

function escapeIlike(q: string): string {
  return q.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim() || q.slice(0, 80)
}

// Score: exact = 100, startsWith = 80, includes = 60
function scoreText(text: string | null | undefined, q: string): number {
  if (!text || !q) return 0
  const t = text.toLowerCase()
  const qLower = q.toLowerCase()
  if (t === qLower) return 100
  if (t.startsWith(qLower)) return 80
  if (t.includes(qLower)) return 60
  return 0
}

// GET /api/search?q=burger — global search: dishes + restaurants, score-based
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({ error: 'Missing search query' }, { status: 400 })
    }

    const safeQ = escapeIlike(q)
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

    let nearbyStoreIds: Set<string> | null = null
    if (hasValidCoords) {
      const delta = BBOX_DEGREE_APPROX * (radiusKm / 10)
      const latMin = userLat - delta
      const latMax = userLat + delta
      const lonMin = userLon - delta
      const lonMax = userLon + delta
      const nearbyRes = await supabase
        .from('merchant_stores')
        .select('store_id, latitude, longitude, delivery_radius_km, is_active, status, approval_status')
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', latMin)
        .lte('latitude', latMax)
        .gte('longitude', lonMin)
        .lte('longitude', lonMax)

      if (!nearbyRes.error) {
        const allowed = filterStoreRowsByUserGeo(nearbyRes.data ?? [], userLat, userLon, radiusKm)
        nearbyStoreIds = new Set(
          allowed
            .map((row: any) => String(row?.store_id ?? '').trim())
            .filter((id: string) => id.length > 0)
        )
      }
    }

    const [itemsRes, storesRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, item_name, category, category_item, restaurant_id, price, image_url')
        .or(`item_name.ilike.%${safeQ}%,category.ilike.%${safeQ}%,category_item.ilike.%${safeQ}%`)
        .eq('is_active', true)
        .limit(50),
      supabase
        .from('merchant_stores')
        .select('store_id, store_name, store_display_name, banner_url, full_address')
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .or(`store_name.ilike.%${safeQ}%,store_display_name.ilike.%${safeQ}%,full_address.ilike.%${safeQ}%`)
        .limit(30),
    ])

    if (itemsRes.error) {
      return NextResponse.json({ error: 'Search failed', details: itemsRes.error.message }, { status: 500 })
    }

    const items = (itemsRes.data || []) as Array<{
      id: number
      item_name: string
      category: string
      category_item: string
      restaurant_id: number
      price?: number
      image_url?: string
    }>
    const stores = (storesRes.data || []) as Array<{
      store_id: string
      store_name?: string
      store_display_name?: string | null
      banner_url?: string | null
      full_address?: string
    }>

    const filteredStores =
      nearbyStoreIds == null
        ? stores
        : stores.filter((s) => nearbyStoreIds!.has(String(s.store_id ?? '').trim()))

    const dishResults = items
      .filter((item) => {
        if (nearbyStoreIds == null) return true
        return nearbyStoreIds.has(String(item.restaurant_id ?? '').trim())
      })
      .map((item) => {
        const s1 = scoreText(item.item_name, q)
        const s2 = scoreText(item.category, q)
        const s3 = scoreText(item.category_item, q)
        const score = Math.max(s1, s2, s3) || 40
        return { type: 'dish' as const, ...item, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS)

    const restaurantResults = filteredStores
      .map((r) => {
        const name = r.store_display_name || r.store_name || ''
        const score = scoreText(name, q) || scoreText(r.full_address, q) || 40
        return {
          type: 'restaurant' as const,
          id: r.store_id,
          restaurant_id: r.store_id,
          restaurant_name: name,
          name,
          image_url: r.banner_url ?? undefined,
          address: r.full_address,
          score,
        }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESTAURANTS)

    const combined = [...dishResults, ...restaurantResults].sort((a, b) => b.score - a.score)

    return NextResponse.json(combined, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
