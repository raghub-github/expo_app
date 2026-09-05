/**
 * merchant_stores.store_type (Postgres enum) — filters for Around You / listings.
 * Keep in sync with DB enum values.
 */
export const MERCHANT_STORE_TYPE_DB_VALUES = [
  'GENERAL',
  'FOOD',
  'GROCERY',
  'RESTAURANT',
  'CLOUD_KITCHEN',
  'WAREHOUSE',
  'STORE',
  'GARAGE',
  'PHARMA',
  'STATIONERY',
  'CAFE',
  'BAKERY',
  'OTHERS',
  'ELECTRONICS_ECOMMERCE',
  'FASHION',
] as const

export type MerchantStoreTypeDb = (typeof MERCHANT_STORE_TYPE_DB_VALUES)[number]

const ALLOWED = new Set<string>(MERCHANT_STORE_TYPE_DB_VALUES)

/** UI: no GENERAL, no FOOD (removed per product). API still accepts FOOD in queries. */
export type AroundYouStoreTypeFilterValue = 'ALL' | Exclude<MerchantStoreTypeDb, 'GENERAL' | 'FOOD'>

/** Legacy / API union */
export type MerchantStoreTypeFilterValue = AroundYouStoreTypeFilterValue | 'NULL' | 'GENERAL' | 'FOOD'

export function formatMerchantStoreTypeLabel(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Priority: Restaurant → Fashion → Pharma → Electronics & Ecommerce → Grocery → rest.
 * FOOD omitted from UI.
 */
const AROUND_YOU_TYPE_ORDER: Exclude<MerchantStoreTypeDb, 'GENERAL' | 'FOOD'>[] = [
  'RESTAURANT',
  'FASHION',
  'PHARMA',
  'ELECTRONICS_ECOMMERCE',
  'GROCERY',
  'CLOUD_KITCHEN',
  'WAREHOUSE',
  'STORE',
  'GARAGE',
  'STATIONERY',
  'CAFE',
  'BAKERY',
  'OTHERS',
]

export const AROUND_YOU_STORE_TYPE_FILTERS: { value: AroundYouStoreTypeFilterValue; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  ...AROUND_YOU_TYPE_ORDER.map((value) => ({
    value,
    label:
      value === 'ELECTRONICS_ECOMMERCE'
        ? 'Electronics & Ecommerce'
        : formatMerchantStoreTypeLabel(value),
  })),
]

export type ParsedStoreTypeParam =
  | { mode: 'all' }
  | { mode: 'is_null' }
  | { mode: 'eq'; value: MerchantStoreTypeDb }

/**
 * GET ?store_type= — ALL / omitted = no filter; NULL = IS NULL; else must match allowlist.
 */
export function parseStoreTypeQueryParam(raw: string | null | undefined): ParsedStoreTypeParam {
  if (raw == null || raw === '') return { mode: 'all' }
  const t = raw.trim().toUpperCase()
  if (t === 'ALL') return { mode: 'all' }
  if (t === 'NULL' || t === '__NULL__') return { mode: 'is_null' }
  if (ALLOWED.has(t)) return { mode: 'eq', value: t as MerchantStoreTypeDb }
  return { mode: 'all' }
}

/** Food vs grocery catalog split used by /order, /restaurants, and /grocery. */
export type StoreListingVertical = 'all' | 'food' | 'grocery'

export function parseListingQueryParam(raw: string | null | undefined): StoreListingVertical {
  const t = (raw ?? '').trim().toLowerCase()
  if (t === 'food') return 'food'
  if (t === 'grocery') return 'grocery'
  return 'all'
}

function normalizeStoreType(storeType: string | null | undefined): string {
  return (storeType ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

const NON_FOOD_VERTICALS = new Set([
  'GROCERY',
  'PHARMA',
  'FASHION',
  'ELECTRONICS_ECOMMERCE',
  'STATIONERY',
  'GARAGE',
  'WAREHOUSE',
])

export function isGroceryStoreType(storeType: string | null | undefined): boolean {
  return normalizeStoreType(storeType) === 'GROCERY'
}

function groceryCueText(value: string | null | undefined): boolean {
  if (!value) return false
  return /\bgrocery\b|\bkirana\b|\bsupermarket\b|\bpan\s*bhandar\b/i.test(value)
}

export type StoreListingRow = {
  store_type?: string | null
  cuisine_type?: string | null
  cuisine_types?: string[] | null
  restaurant_name?: string | null
  name?: string | null
  store_name?: string | null
  store_display_name?: string | null
}

export function isGroceryListingStore(row: StoreListingRow): boolean {
  if (isGroceryStoreType(row.store_type)) return true
  const cuisine =
    row.cuisine_type ||
    (Array.isArray(row.cuisine_types) ? row.cuisine_types.join(', ') : '')
  if (groceryCueText(cuisine)) return true
  const name = row.restaurant_name || row.name || row.store_display_name || row.store_name || ''
  return groceryCueText(name)
}

export function isFoodOrderStore(row: StoreListingRow): boolean {
  if (isGroceryListingStore(row)) return false
  const n = normalizeStoreType(row.store_type)
  if (NON_FOOD_VERTICALS.has(n)) return false
  return true
}

export function applyListingVerticalFilter<T extends StoreListingRow>(
  rows: T[],
  listing: StoreListingVertical
): T[] {
  if (listing === 'grocery') return rows.filter((r) => isGroceryListingStore(r))
  if (listing === 'food') return rows.filter((r) => isFoodOrderStore(r))
  return rows
}
