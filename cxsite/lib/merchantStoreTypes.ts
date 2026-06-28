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
