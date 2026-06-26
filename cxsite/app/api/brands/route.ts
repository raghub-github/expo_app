import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_RADIUS_KM = 10
const MAX_RADIUS_KM = 50
/** ~1 degree lat ≈ 111 km; for 50 km use ~0.45 degree bounding box */
const BBOX_DEGREE_APPROX = 0.1

/**
 * Haversine distance in km between two points (lat/lon in degrees).
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.asin(Math.sqrt(a))
  return R * c
}

type MerchantParentRow = {
  id: number
  parent_merchant_id: string
  parent_name: string
  brand_name: string | null
  business_category: string | null
  store_logo: string | null
  merchant_type: string
  city: string | null
  state: string | null
  is_active: boolean
  approval_status: string
  registration_status: string | null
}

type StoreRow = {
  parent_id: number | null
  parent_merchant_id: string | null
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  landmark?: string | null
  full_address?: string | null
}

/** Category slug → regex for business_category match (Zomato-style) */
const CATEGORY_PATTERNS: Record<string, RegExp> = {
  food: /food|restaurant|cafe|bakery|dining|quick\s*service|qsr/i,
  fashion: /fashion|clothing|apparel|footwear|textile|garment/i,
  pharma: /pharma|pharmacy|health|medical/i,
  electronics: /electronic|tech|gadget|ecommerce|e-commerce|online/i,
}

function mapRowsToBrands(rows: MerchantParentRow[]) {
  return rows.map((row) => {
    const logoRaw = row.store_logo
    const logo =
      logoRaw != null && String(logoRaw).trim() !== ''
        ? String(logoRaw).trim()
        : null
    const storeName = row.brand_name || row.parent_name || 'Store'
    const locationParts = [row.city, row.state].filter(Boolean)
    const location = locationParts.length > 0 ? locationParts.join(', ') : null
    return {
      id: row.id,
      parent_merchant_id: row.parent_merchant_id,
      parent_name: row.parent_name,
      merchant_type: row.merchant_type,
      business_category: row.business_category,
      city: row.city,
      state: row.state,
      store_logo: logo,
      is_active: row.is_active,
      approval_status: row.approval_status,
      store_name: storeName,
      logo,
      short_description: row.business_category ?? null,
      category: row.business_category ?? null,
      rating: null as number | null,
      location,
      is_verified: row.registration_status === 'VERIFIED',
    }
  })
}

/**
 * GET /api/brands
 *
 * - Without lat/lon: returns ALL brands (initial list for users who haven't set location).
 * - With lat/lon: returns only brands that have at least one active child store within radius (default 10 km).
 *   If none in range, returns { brands: [], message: 'No brands in your area' }.
 *
 * Query params: lat, lon (geo); city, area (location slug); category (food|fashion|pharma|electronics); radius_km, page, limit.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon')
    const cityParam = searchParams.get('city')?.trim()
    const areaParam = searchParams.get('area')?.trim()
    const categoryParam = searchParams.get('category')?.trim()
    const radiusParam = searchParams.get('radius_km')
    const pageParam = searchParams.get('page')
    const limitParam = searchParams.get('limit')

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '100', 10) || 100))
    const from = (page - 1) * limit
    const to = from + limit - 1

    const userLat = latParam != null ? parseFloat(latParam) : NaN
    const userLon = lonParam != null ? parseFloat(lonParam) : NaN
    const hasValidCoords =
      !Number.isNaN(userLat) &&
      !Number.isNaN(userLon) &&
      userLat >= -90 &&
      userLat <= 90 &&
      userLon >= -180 &&
      userLon <= 180

    const radiusKm = Math.min(
      MAX_RADIUS_KM,
      Math.max(1, parseInt(radiusParam ?? String(DEFAULT_RADIUS_KM), 10) || DEFAULT_RADIUS_KM)
    )

    // City/area-based filtering (dynamic URL: /patna/agam-kuan?category=food)
    if (!hasValidCoords && cityParam) {
      const cityDisplay = cityParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
      const cityPattern = `%${cityDisplay}%`

      const { data: storesData, error: storesError } = await supabase
        .from('merchant_stores')
        .select('parent_id, parent_merchant_id, city, landmark, full_address')
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .ilike('city', cityPattern)

      if (storesError) {
        console.error('[api/brands] merchant_stores (city) error:', storesError.message)
        return NextResponse.json(
          { error: 'Failed to fetch stores', details: storesError.message },
          { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        )
      }

      let stores = (storesData ?? []) as StoreRow[]
      const areaIsCityWide =
        !areaParam ||
        areaParam === cityParam ||
        areaParam === `${cityParam}-city` ||
        areaParam === cityParam.replace(/-/g, '')
      if (areaParam && !areaIsCityWide) {
        const areaWords = areaParam.replace(/-/g, ' ').split(' ').filter(Boolean)
        stores = stores.filter((s) =>
          areaWords.length === 0 ||
          areaWords.some(
            (w) =>
              (s.landmark && s.landmark.toLowerCase().includes(w.toLowerCase())) ||
              (s.full_address && s.full_address.toLowerCase().includes(w.toLowerCase())) ||
              (s.city && s.city.toLowerCase().includes(w.toLowerCase()))
          )
        )
      }

      const parentIds = new Set<string>()
      const parentIdsToResolve = new Set<number>()
      for (const row of stores) {
        if (row.parent_merchant_id) parentIds.add(row.parent_merchant_id)
        else if (row.parent_id != null) parentIdsToResolve.add(row.parent_id)
      }
      if (parentIdsToResolve.size > 0) {
        const { data: parentsData } = await supabase
          .from('merchant_parents')
          .select('id, parent_merchant_id')
          .in('id', Array.from(parentIdsToResolve))
        for (const p of parentsData ?? []) {
          const r = p as { id: number; parent_merchant_id: string }
          if (r.parent_merchant_id) parentIds.add(r.parent_merchant_id)
        }
      }
      const parentIdList = Array.from(parentIds)

      if (parentIdList.length === 0) {
        const res = NextResponse.json({
          brands: [],
          location_filter_applied: true,
          message: areaParam ? 'No brands available in this location.' : 'No brands available in this city yet.',
        })
        res.headers.set('Cache-Control', 'no-store, max-age=0')
        return res
      }

      let query = supabase
        .from('merchant_parents')
        .select(
          'id, parent_merchant_id, parent_name, brand_name, business_category, store_logo, merchant_type, city, state, is_active, approval_status, registration_status'
        )
        .eq('merchant_type', 'BRAND')
        .eq('is_active', true)
        .eq('approval_status', 'APPROVED')
        .or('registration_status.eq.VERIFIED,registration_status.is.null')
        .in('parent_merchant_id', parentIdList)
        .order('parent_name', { ascending: true })

      if (categoryParam && CATEGORY_PATTERNS[categoryParam]) {
        const re = CATEGORY_PATTERNS[categoryParam]
        const { data: allData } = await query
        const rows = (allData ?? []) as MerchantParentRow[]
        const filtered = rows.filter((r) => r.business_category && re.test(r.business_category))
        const res = NextResponse.json({
          brands: mapRowsToBrands(filtered.slice(from, to + 1)),
          location_filter_applied: true,
        })
        res.headers.set('Cache-Control', 'no-store, max-age=0')
        return res
      }
      if (limitParam || pageParam) query = query.range(from, to)
      const { data, error } = await query
      if (error) {
        console.error('[api/brands] merchant_parents (city) error:', error.message)
        return NextResponse.json(
          { error: 'Failed to fetch brands', details: error.message },
          { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        )
      }
      const rows = (data ?? []) as MerchantParentRow[]
      const res = NextResponse.json({
        brands: mapRowsToBrands(rows),
        location_filter_applied: true,
      })
      res.headers.set('Cache-Control', 'no-store, max-age=0')
      return res
    }

    // No location and no city → return ALL brands (initial state)
    if (!hasValidCoords) {
      let query = supabase
        .from('merchant_parents')
        .select(
          'id, parent_merchant_id, parent_name, brand_name, business_category, store_logo, merchant_type, city, state, is_active, approval_status, registration_status'
        )
        .eq('merchant_type', 'BRAND')
        .eq('is_active', true)
        .eq('approval_status', 'APPROVED')
        .or('registration_status.eq.VERIFIED,registration_status.is.null')
        .order('parent_name', { ascending: true })
      if (limitParam || pageParam) query = query.range(from, to)
      const { data, error } = await query
      if (error) {
        console.error('[api/brands] merchant_parents (all) error:', error.message)
        return NextResponse.json(
          { error: 'Failed to fetch brands', details: error.message },
          { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        )
      }
      const rows = (data ?? []) as MerchantParentRow[]
      const res = NextResponse.json({
        brands: mapRowsToBrands(rows),
        location_filter_applied: false,
      })
      res.headers.set('Cache-Control', 'no-store, max-age=0')
      return res
    }

    // 1) Bounding box to limit rows, then exact Haversine filter
    const delta = BBOX_DEGREE_APPROX * (radiusKm / 10)
    const latMin = userLat - delta
    const latMax = userLat + delta
    const lonMin = userLon - delta
    const lonMax = userLon + delta

    // merchant_stores: status = ACTIVE (store_status), approval_status = APPROVED (store_approval_status), is_active = true
    const { data: storesData, error: storesError } = await supabase
      .from('merchant_stores')
      .select('parent_id, parent_merchant_id, latitude, longitude')
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
      console.error('[api/brands] merchant_stores error:', storesError.message)
      return NextResponse.json(
        { error: 'Failed to fetch stores', details: storesError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const stores = (storesData ?? []) as StoreRow[]
    const parentIdsWithinRadius = new Set<string>()
    const parentIdsToResolve = new Set<number>()
    for (const row of stores) {
      const lat = row.latitude
      const lon = row.longitude
      if (lat == null || lon == null) continue
      const dist = haversineKm(userLat, userLon, Number(lat), Number(lon))
      if (dist > radiusKm) continue
      const pid = row.parent_merchant_id
      if (pid) {
        parentIdsWithinRadius.add(pid)
      } else if (row.parent_id != null) {
        parentIdsToResolve.add(row.parent_id)
      }
    }
    if (parentIdsToResolve.size > 0) {
      const { data: parentsData } = await supabase
        .from('merchant_parents')
        .select('id, parent_merchant_id')
        .in('id', Array.from(parentIdsToResolve))
      for (const p of parentsData ?? []) {
        const row = p as { id: number; parent_merchant_id: string }
        if (row.parent_merchant_id) parentIdsWithinRadius.add(row.parent_merchant_id)
      }
    }
    let parentIdList = Array.from(parentIdsWithinRadius)

    // Optional fallback: if no brands in default radius (10 km), expand to 15 km once
    const fallbackRadiusKm = 15
    if (parentIdList.length === 0 && radiusKm === DEFAULT_RADIUS_KM && fallbackRadiusKm > radiusKm) {
      const deltaFallback = BBOX_DEGREE_APPROX * (fallbackRadiusKm / 10)
      const { data: storesDataFallback } = await supabase
        .from('merchant_stores')
        .select('parent_id, parent_merchant_id, latitude, longitude')
        .eq('is_active', true)
        .eq('status', 'ACTIVE')
        .eq('approval_status', 'APPROVED')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('latitude', userLat - deltaFallback)
        .lte('latitude', userLat + deltaFallback)
        .gte('longitude', userLon - deltaFallback)
        .lte('longitude', userLon + deltaFallback)

      const storesFallback = (storesDataFallback ?? []) as StoreRow[]
      for (const row of storesFallback) {
        const lat = row.latitude
        const lon = row.longitude
        if (lat == null || lon == null) continue
        const dist = haversineKm(userLat, userLon, Number(lat), Number(lon))
        if (dist > fallbackRadiusKm) continue
        if (row.parent_merchant_id) parentIdsWithinRadius.add(row.parent_merchant_id)
        else if (row.parent_id != null) parentIdsToResolve.add(row.parent_id)
      }
      if (parentIdsToResolve.size > 0) {
        const { data: parentsDataFb } = await supabase
          .from('merchant_parents')
          .select('id, parent_merchant_id')
          .in('id', Array.from(parentIdsToResolve))
        for (const p of parentsDataFb ?? []) {
          const r = p as { id: number; parent_merchant_id: string }
          if (r.parent_merchant_id) parentIdsWithinRadius.add(r.parent_merchant_id)
        }
      }
      parentIdList = Array.from(parentIdsWithinRadius)
    }

    if (parentIdList.length === 0) {
      const res = NextResponse.json({
        brands: [],
        location_required: false,
        message: 'No brands available in your area yet.',
      })
      res.headers.set('Cache-Control', 'no-store, max-age=0')
      return res
    }

    // 2) Fetch merchant_parents for those IDs (BRAND, active, approved; registration_status VERIFIED or null)
    let query = supabase
      .from('merchant_parents')
      .select(
        'id, parent_merchant_id, parent_name, brand_name, business_category, store_logo, merchant_type, city, state, is_active, approval_status, registration_status'
      )
      .eq('merchant_type', 'BRAND')
      .eq('is_active', true)
      .eq('approval_status', 'APPROVED')
      .or('registration_status.eq.VERIFIED,registration_status.is.null')
      .in('parent_merchant_id', parentIdList)
      .order('parent_name', { ascending: true })

    if (limitParam || pageParam) {
      query = query.range(from, to)
    }

    const { data, error } = await query

    if (error) {
      console.error('[api/brands] Supabase error:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch brands', details: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const rows = (data ?? []) as MerchantParentRow[]
    const brands = mapRowsToBrands(rows)

    const res = NextResponse.json({
      brands,
      location_filter_applied: true,
    })
    res.headers.set('Cache-Control', 'no-store, max-age=0')
    return res
  } catch (err) {
    console.error('[api/brands] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
