import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { resolveImageUrlList, toAbsoluteImageUrl } from '@/lib/mediaUrl'
import { getStoreRatingSummary, getStoreWrittenReviews } from '@/lib/server/fetchStoreRatings'
import { lookupMerchantStoreRow } from '@/lib/server/lookupMerchantStoreRow'
import { ensureStorePublicSlug } from '@/lib/server/ensureStorePublicSlug'
import { sanitizePublicStorePayload } from '@/lib/server/sanitizePublicStoreResponse'
import { isStorePubliclyVisible } from '@/lib/server/resolveMerchantStore'

function mergeGallerySources(row: Record<string, unknown>): string[] {
  const raw: unknown[] = []
  if (Array.isArray(row.gallery_images)) raw.push(...row.gallery_images)
  if (Array.isArray(row.ads_images)) raw.push(...row.ads_images)
  return resolveImageUrlList(raw.length > 0 ? raw : null)
}

function pickBannerUrl(row: Record<string, unknown>): string | null {
  const candidates = [
    row.banner_url,
    row.store_banner_url,
    row.store_img,
    row.logo_url,
  ]
  for (const c of candidates) {
    const resolved = toAbsoluteImageUrl(typeof c === 'string' ? c : null)
    if (resolved) return resolved
  }
  return null
}

/** Map merchant_stores row to the shape expected by RestaurantPage. Exact DB values only, no defaults for status. */
function mapStoreToRestaurant(row: Record<string, unknown>) {
  const storeName = (row.store_display_name ?? row.store_name ?? '') as string
  const cuisineTypes = (row.cuisine_types as string[] | null) ?? []
  const cuisineType = cuisineTypes.length > 0 ? cuisineTypes.join(', ') : ''
  const bannerUrl = pickBannerUrl(row)
  return {
    id: row.id,
    store_id: row.store_id,
    public_slug: row.public_slug ?? null,
    restaurant_id: row.store_id,
    restaurant_name: storeName,
    name: storeName,
    address: row.full_address,
    full_address: row.full_address,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country,
    image_url: bannerUrl,
    banner_url: bannerUrl,
    store_img: toAbsoluteImageUrl((row.store_img as string | null) ?? (row.logo_url as string | null) ?? null),
    cuisine_type: cuisineType,
    cuisine_types: cuisineTypes,
    is_veg: row.is_pure_veg ?? false,
    is_pure_veg: row.is_pure_veg ?? false,
    avg_preparation_time_minutes: row.avg_preparation_time_minutes ?? null,
    min_order_amount: row.min_order_amount ?? null,
    delivery_radius_km: row.delivery_radius_km ?? null,
    is_active: row.is_active ?? null,
    is_accepting_orders: row.is_accepting_orders ?? null,
    status: row.status ?? null,
    approval_status: row.approval_status ?? null,
    is_verified: (row.approval_status as string) === 'APPROVED',
    store_name: row.store_name,
    store_display_name: row.store_display_name,
    store_description: row.store_description,
    store_email: row.store_email,
    store_phones: row.store_phones ?? null,
    gallery_images: mergeGallerySources(row),
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    /** Exact value from merchant_stores.operational_status – OPEN, CLOSED, TEMPORARILY_CLOSED, or null. No frontend default. */
    operational_status: row.operational_status ?? null,
    opening_time: row.opening_time ?? null,
    closing_time: row.closing_time ?? null,
    phone: Array.isArray(row.store_phones) && (row.store_phones as string[]).length > 0
      ? (row.store_phones as string[])[0]
      : (row.store_phones as string) || null,
    fssai_license: (row.fssai_license as string) || (row.fssai_license_number as string) || null,
    /** Filled from merchant_store_ratings (same table as customer app). */
    avg_rating: null as number | null,
    total_reviews: null as number | null,
  }
}

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'
function log(...args: unknown[]) {
  if (DEBUG) console.log('[GET /api/restaurants/[storeId]]', new Date().toISOString(), ...args)
}

/** Format time from DB (e.g. "09:00:00") to "9:00 AM" / "12:30 PM" */
function formatTime(t: string | null | undefined): string | null {
  if (t == null || String(t).trim() === '') return null
  const s = String(t).trim()
  const part = s.split(':')
  const h = parseInt(part[0], 10)
  if (Number.isNaN(h)) return null
  const m = part[1] ? parseInt(part[1], 10) : 0
  if (Number.isNaN(m)) return null
  if (h === 0 && m === 0) return '12:00 AM'
  if (h < 12) return `${h}:${m.toString().padStart(2, '0')} AM`
  if (h === 12) return `12:${m.toString().padStart(2, '0')} PM`
  return `${h - 12}:${m.toString().padStart(2, '0')} PM`
}

/** Normalize closed_days[] entries for comparison with weekday keys and labels */
function isDayMarkedClosed(
  dayKey: string,
  dayLabel: string,
  closedDays: unknown
): boolean {
  if (!Array.isArray(closedDays) || closedDays.length === 0) return false
  const label = dayLabel.toLowerCase()
  const key = dayKey.toLowerCase()
  for (const raw of closedDays) {
    const s = String(raw).trim().toLowerCase()
    if (!s) continue
    if (s === label || s === key) return true
  }
  return false
}

function buildOneDaySlots(
  day: string,
  dayLabel: string,
  row: Record<string, unknown>,
  is24: boolean
): { day: string; open: boolean; slots: string[] } {
  const inClosedDays = isDayMarkedClosed(day, dayLabel, row.closed_days)
  const open = row[`${day}_open`] === true && !inClosedDays
  const slot1Start = formatTime(row[`${day}_slot1_start`] as string)
  const slot1End = formatTime(row[`${day}_slot1_end`] as string)
  const slot2Start = formatTime(row[`${day}_slot2_start`] as string)
  const slot2End = formatTime(row[`${day}_slot2_end`] as string)
  const slots: string[] = []
  if (open && is24) slots.push('24 hours')
  else if (open && slot1Start && slot1End) {
    slots.push(`${slot1Start} – ${slot1End}`)
    if (slot2Start && slot2End) slots.push(`${slot2Start} – ${slot2End}`)
  } else if (open) slots.push('Open')
  return { day: dayLabel, open, slots }
}

/** Build per-day slots from merchant_store_operating_hours row */
function buildOperatingHoursSlots(row: Record<string, unknown>): { day: string; open: boolean; slots: string[] }[] {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const is24 = row.is_24_hours === true
  let result = days.map((day, i) => buildOneDaySlots(day, dayLabels[i], row, is24))

  if (row.same_for_all_days === true) {
    const sample =
      result.find((r) => r.slots.length > 0) ?? result.find((r) => r.open && is24) ?? result[0]
    if (sample) {
      result = result.map((r) => ({
        day: r.day,
        open: sample.open,
        slots: [...sample.slots],
      }))
    }
  }
  return result
}

/** When no row in merchant_store_operating_hours, show merchant_stores.opening_time / closing_time for every day */
function buildSyntheticOperatingHoursFromDaily(
  openingRaw: unknown,
  closingRaw: unknown
): { day: string; open: boolean; slots: string[] }[] | null {
  const o = formatTime(openingRaw as string)
  const c = formatTime(closingRaw as string)
  if (!o && !c) return null
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const slots: string[] = []
  if (o && c) slots.push(`${o} – ${c}`)
  else if (o) slots.push(o)
  else if (c) slots.push(`Until ${c}`)
  return dayLabels.map((day) => ({ day, open: true, slots: [...slots] }))
}

/** Weekday label in India business timezone (matches store schedule engine). */
function getTodayWeekdayLabelIST(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

/**
 * When live operating_hours exist, overwrite legacy opening_time/closing_time
 * with today's slot so clients that still prefer those columns never show
 * registration-era stale values.
 */
function applyTodaySlotToLegacyTimes(
  payload: Record<string, unknown>,
  operatingHours: { day: string; open: boolean; slots: string[] }[]
): void {
  const today = getTodayWeekdayLabelIST()
  const todayOh = operatingHours.find((d) => d.day === today)
  if (!todayOh) return
  if (!todayOh.open) {
    payload.opening_time = null
    payload.closing_time = null
    return
  }
  const first = todayOh.slots[0]
  if (!first) return
  if (first === '24 hours' || /^24\s*hours$/i.test(first)) {
    payload.opening_time = '12:00 AM'
    payload.closing_time = '11:59 PM'
    return
  }
  const parts = first.split(/\s*[–-]\s*/)
  if (parts.length >= 2) {
    payload.opening_time = parts[0]!.trim()
    payload.closing_time = parts[1]!.trim()
  }
}
async function enrichMediaFromRegistry(
  storeClient: NonNullable<ReturnType<typeof getSupabaseServiceRole>>,
  storeIdNum: number,
  payload: ReturnType<typeof mapStoreToRestaurant>
) {
  const hasBanner = Boolean(payload.banner_url)
  const hasGallery = Array.isArray(payload.gallery_images) && payload.gallery_images.length > 0
  if (hasBanner && hasGallery) return payload

  const { data: mediaRows, error } = await storeClient
    .from('merchant_store_media_files')
    .select('media_scope, r2_key, public_url, menu_url')
    .eq('store_id', storeIdNum)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('media_scope', ['BANNER', 'GALLERY'])
    .order('created_at', { ascending: true })

  if (error || !mediaRows?.length) return payload

  const galleryUrls: string[] = [...(payload.gallery_images ?? [])]
  let bannerUrl = payload.banner_url ?? null

  for (const row of mediaRows as Array<Record<string, unknown>>) {
    const scope = String(row.media_scope ?? '').toUpperCase()
    const raw =
      (typeof row.public_url === 'string' && row.public_url) ||
      (typeof row.menu_url === 'string' && row.menu_url) ||
      (typeof row.r2_key === 'string' && row.r2_key) ||
      null
    const resolved = toAbsoluteImageUrl(raw)
    if (!resolved) continue
    if (scope === 'BANNER' && !bannerUrl) bannerUrl = resolved
    if (scope === 'GALLERY' && !galleryUrls.includes(resolved)) galleryUrls.push(resolved)
  }

  return {
    ...payload,
    banner_url: bannerUrl,
    image_url: bannerUrl,
    gallery_images: galleryUrls.length > 0 ? galleryUrls : payload.gallery_images,
  }
}

// GET /api/restaurants/[storeId] — single store from merchant_stores + operating hours (for detail page)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    log('storeId:', storeId)
    if (!storeId) {
      return NextResponse.json({ error: 'Missing store id' }, { status: 400 })
    }

    const idParam = String(storeId).trim()

    const storeClient = getSupabaseServiceRole() ?? supabase
    if (!storeClient) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    let data = await lookupMerchantStoreRow(idParam)

    if (!data) {
      log('No store found for identifier:', storeId)
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    if (!data.public_slug) {
      const slug = await ensureStorePublicSlug(data as Parameters<typeof ensureStorePublicSlug>[0])
      if (slug) data = { ...data, public_slug: slug }
    }

    if (!isStorePubliclyVisible(data as Parameters<typeof isStorePubliclyVisible>[0])) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 })
    }

    const storeIdNum = data.id as number
    /** Prefer service role so RLS on merchant_store_operating_hours does not hide rows from anon. */
    const hoursClient = getSupabaseServiceRole() ?? supabase
    const { data: hoursRow, error: hoursErr } = await hoursClient
      .from('merchant_store_operating_hours')
      .select('*')
      .eq('store_id', storeIdNum)
      .maybeSingle()

    if (hoursErr) log('Supabase merchant_store_operating_hours error:', hoursErr.message)

    const payload = await enrichMediaFromRegistry(
      storeClient,
      storeIdNum,
      mapStoreToRestaurant(data)
    )
    if (hoursRow) {
      const operatingHours = buildOperatingHoursSlots(hoursRow as Record<string, unknown>)
      ;(payload as Record<string, unknown>).operating_hours = operatingHours
      ;(payload as Record<string, unknown>).operating_hours_raw = hoursRow
      applyTodaySlotToLegacyTimes(payload as Record<string, unknown>, operatingHours)
    } else {
      const synthetic = buildSyntheticOperatingHoursFromDaily(data.opening_time, data.closing_time)
      ;(payload as Record<string, unknown>).operating_hours = synthetic
      ;(payload as Record<string, unknown>).operating_hours_raw = null
    }

    // Same source as customer app: merchant_store_ratings (recency-weighted + written reviews).
    try {
      const [rating, writtenReviews] = await Promise.all([
        getStoreRatingSummary(storeIdNum),
        getStoreWrittenReviews(storeIdNum, 40),
      ])
      ;(payload as Record<string, unknown>).avg_rating = rating?.avgRating ?? null
      ;(payload as Record<string, unknown>).total_reviews = rating?.totalReviews ?? null
      ;(payload as Record<string, unknown>).written_reviews = writtenReviews
    } catch (ratingErr) {
      log('merchant_store_ratings aggregate failed:', ratingErr)
      ;(payload as Record<string, unknown>).avg_rating = null
      ;(payload as Record<string, unknown>).total_reviews = null
      ;(payload as Record<string, unknown>).written_reviews = []
    }

    log('Returning store:', data.public_slug, data.store_name ?? data.store_display_name)
    const res = NextResponse.json(sanitizePublicStorePayload(payload as Record<string, unknown>))
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return res
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
