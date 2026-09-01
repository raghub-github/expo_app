const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://gatimitra.com'

/** Canonical path for a public restaurant page (no query string). */
export function restaurantPublicPath(publicSlug: string): string {
  const slug = String(publicSlug ?? '').trim()
  return `/restaurant/${encodeURIComponent(slug)}`
}

/** Absolute canonical restaurant URL for SEO / share / JSON-LD. */
export function restaurantCanonicalUrl(publicSlug: string): string {
  return `${SITE_ORIGIN}${restaurantPublicPath(publicSlug)}`
}

export function restaurantPageTitle(storeName: string, city: string): string {
  const name = storeName.trim() || 'Restaurant'
  const loc = city.trim()
  return loc ? `${name}, ${loc} | GatiMitra` : `${name} | GatiMitra`
}

export function restaurantMetaDescription(storeName: string, city: string): string {
  const name = storeName.trim() || 'this restaurant'
  const loc = city.trim() || 'your area'
  return `Order from ${name} in ${loc} on GatiMitra. Explore menu, food, offers, timings and order online.`
}
