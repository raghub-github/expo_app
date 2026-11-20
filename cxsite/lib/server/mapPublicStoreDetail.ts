import { toAbsoluteImageUrl, resolveImageUrlList } from '@/lib/mediaUrl'
import type { MerchantStoreRow } from '@/lib/server/resolveMerchantStore'

/**
 * Map a merchant_stores row to the public restaurant detail shape used by
 * RestaurantPage / GroceryStorePage (SSR seed + API parity).
 */
export function mapPublicStoreDetail(row: MerchantStoreRow): Record<string, unknown> {
  const storeName = String(row.store_display_name ?? row.store_name ?? '').trim()
  const cuisineTypes = (row.cuisine_types as string[] | null) ?? []
  const cuisineType = cuisineTypes.length > 0 ? cuisineTypes.join(', ') : ''

  const galleryRaw: unknown[] = []
  if (Array.isArray(row.gallery_images)) galleryRaw.push(...(row.gallery_images as unknown[]))
  if (Array.isArray(row.ads_images)) galleryRaw.push(...(row.ads_images as unknown[]))
  const gallery_images = resolveImageUrlList(galleryRaw.length > 0 ? galleryRaw : null)

  const bannerCandidates = [
    row.banner_url,
    row.store_banner_url,
    row.store_img,
    row.logo_url,
  ]
  let bannerUrl: string | null = null
  for (const c of bannerCandidates) {
    const resolved = toAbsoluteImageUrl(typeof c === 'string' ? c : null)
    if (resolved) {
      bannerUrl = resolved
      break
    }
  }

  const phones = row.store_phones as string[] | string | null | undefined
  const phone =
    Array.isArray(phones) && phones.length > 0
      ? phones[0]
      : typeof phones === 'string'
        ? phones
        : null

  return {
    id: row.id,
    store_id: row.store_id,
    public_slug: row.public_slug ?? null,
    restaurant_id: row.store_id,
    restaurant_name: storeName,
    name: storeName,
    address: row.full_address ?? null,
    full_address: row.full_address ?? null,
    landmark: row.landmark ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    postal_code: row.postal_code ?? null,
    country: row.country ?? null,
    image_url: bannerUrl,
    banner_url: bannerUrl,
    store_img: toAbsoluteImageUrl(
      (row.store_img as string | null) ?? (row.logo_url as string | null) ?? null
    ),
    cuisine_type: cuisineType,
    cuisine_types: cuisineTypes,
    is_veg: Boolean(row.is_pure_veg),
    is_pure_veg: Boolean(row.is_pure_veg),
    avg_preparation_time_minutes: row.avg_preparation_time_minutes ?? null,
    min_order_amount: row.min_order_amount ?? null,
    delivery_radius_km: row.delivery_radius_km ?? null,
    is_active: row.is_active ?? null,
    is_accepting_orders: row.is_accepting_orders ?? null,
    status: row.status ?? null,
    approval_status: row.approval_status ?? null,
    is_verified: String(row.approval_status ?? '').toUpperCase() === 'APPROVED',
    store_name: row.store_name,
    store_display_name: row.store_display_name,
    store_description: row.store_description ?? null,
    store_type: row.store_type ?? null,
    gallery_images,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    operational_status: row.operational_status ?? null,
    opening_time: row.opening_time ?? null,
    closing_time: row.closing_time ?? null,
    phone,
    fssai_license:
      (row.fssai_license as string | null) ||
      (row.fssai_license_number as string | null) ||
      null,
    avg_rating: null,
    total_reviews: null,
  }
}
