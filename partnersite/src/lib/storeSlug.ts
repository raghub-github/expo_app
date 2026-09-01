/** SEO slug helpers — keep in sync with cxsite/lib/storeSlug.ts */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'veg', 'non', 'pure', 'restaurant', 'restaurants',
  'food', 'foods', 'cafe', 'café', 'kitchen', 'north', 'south', 'east', 'west',
  'indian', 'chinese', 'italian', 'continental', 'fast', 'joint', 'eatery',
  'dhaba', 'hotel', 'inn', 'bar', 'grill', 'bistro',
])

function toSlug(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function significantNameWords(name: string): string[] {
  const normalized = String(name ?? '')
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
  return normalized.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

export function generateStorePublicSlug(input: {
  storeName: string
  city: string
  landmark?: string | null
}): string {
  const words = significantNameWords(input.storeName)
  const namePart = words.slice(0, 3).join('-')
  const cityPart = toSlug(input.city)
  let slug = [namePart, cityPart].filter(Boolean).join('-')
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!slug) slug = cityPart || 'store'
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-[^-]*$/, '')
  return slug
}

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
