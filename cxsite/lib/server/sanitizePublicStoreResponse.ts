/**
 * Strip internal identifiers from public customer store API responses.
 * Numeric `id` is retained where required for cart/realtime subscriptions.
 */

const INTERNAL_KEYS = new Set([
  'store_id',
  'restaurant_id',
  'parent_id',
  'approved_by',
  'created_by',
  'updated_by',
  'deleted_by',
  'delisted_at',
  'deleted_at',
  'delist_reason',
  'rejected_reason',
  'approval_reason',
])

export function sanitizePublicStorePayload<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload }
  for (const key of INTERNAL_KEYS) {
    delete out[key]
  }
  return out
}

export function sanitizePublicStoreListRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row }
  delete out.store_id
  delete out.restaurant_id
  delete out.parent_id
  return out
}

export function sanitizePublicSearchRestaurant(row: {
  type: 'restaurant'
  id: string
  restaurant_id: string
  public_slug?: string | null
  restaurant_name: string
  name: string
  image_url?: string
  address?: string
  score: number
}) {
  const slug = String(row.public_slug ?? '').trim()
  return {
    type: 'restaurant' as const,
    id: slug || row.id,
    public_slug: slug || null,
    restaurant_name: row.restaurant_name,
    name: row.name,
    image_url: row.image_url,
    address: row.address,
    score: row.score,
  }
}
