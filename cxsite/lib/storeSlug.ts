import { toSlug } from '@/lib/slug'

/** Words stripped when building a short public store slug from the display name. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'veg',
  'non',
  'pure',
  'restaurant',
  'restaurants',
  'food',
  'foods',
  'cafe',
  'café',
  'kitchen',
  'north',
  'south',
  'east',
  'west',
  'indian',
  'chinese',
  'italian',
  'continental',
  'fast',
  'joint',
  'eatery',
  'dhaba',
  'hotel',
  'inn',
  'bar',
  'grill',
  'bistro',
])

export type StoreSlugInput = {
  storeName: string
  city: string
  landmark?: string | null
  addressLine1?: string | null
}

/** True when the URL segment is an internal GMM* store code (e.g. GMMC1026). */
export function looksLikeInternalStoreId(param: string): boolean {
  return /^GMM[A-Z]*\d+$/i.test(String(param ?? '').trim())
}

function significantNameWords(name: string): string[] {
  const normalized = String(name ?? '')
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
  const words = normalized.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  return words
}

/**
 * Build a stable SEO slug from store name + city (+ optional locality for collisions).
 * Example: "Hot Chappathis Veg And Non Veg North Indian Restaurant" + Thirupur → hot-chappathis-thirupur
 */
export function generateStorePublicSlug(input: StoreSlugInput): string {
  const words = significantNameWords(input.storeName)
  const namePart = words.slice(0, 3).join('-')
  const cityPart = toSlug(input.city)
  let slug = [namePart, cityPart].filter(Boolean).join('-')
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!slug) slug = cityPart || 'store'
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-[^-]*$/, '')
  return slug
}

/** Append locality/landmark or numeric suffix when base slug is already taken. */
export function disambiguateStoreSlug(
  baseSlug: string,
  taken: Set<string>,
  locality?: string | null
): string {
  if (!taken.has(baseSlug)) return baseSlug
  const loc = toSlug(locality ?? '')
  if (loc) {
    const withLoc = `${baseSlug}-${loc}`
    if (!taken.has(withLoc)) return withLoc
  }
  let n = 2
  while (taken.has(`${baseSlug}-${n}`)) n += 1
  return `${baseSlug}-${n}`
}

export function buildSlugForStoreRow(row: {
  store_display_name?: string | null
  store_name?: string | null
  city?: string | null
  landmark?: string | null
}): string {
  const name = String(row.store_display_name ?? row.store_name ?? '').trim()
  const city = String(row.city ?? '').trim()
  return generateStorePublicSlug({
    storeName: name,
    city,
    landmark: row.landmark ?? null,
  })
}
