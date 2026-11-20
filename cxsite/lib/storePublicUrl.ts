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

/** Zomato-style SERP title: "Roll Club, Model Town, Panipat | Order Online on GatiMitra" */
export function restaurantPageTitle(
  storeName: string,
  city: string,
  landmark?: string | null
): string {
  const name = storeName.trim() || 'Restaurant'
  const area = String(landmark ?? '').trim()
  const loc = city.trim()
  const place = [area, loc].filter(Boolean).join(', ')
  return place
    ? `${name}, ${place} | Order Online on GatiMitra`
    : `${name} | Order Online on GatiMitra`
}

export function restaurantMetaDescription(
  storeName: string,
  city: string,
  landmark?: string | null
): string {
  const name = storeName.trim() || 'this restaurant'
  const area = String(landmark ?? '').trim()
  const loc = city.trim()
  const place = [area, loc].filter(Boolean).join(', ') || 'your area'
  return `${name} is listed on GatiMitra. Order food online from ${name} in ${place} — menu, photos, ratings, offers & delivery. Available on GatiMitra.`
}
