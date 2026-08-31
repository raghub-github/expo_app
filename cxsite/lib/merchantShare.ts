/**
 * Merchant share helpers — public restaurant URLs use SEO slugs:
 * `{base}/restaurant/{public_slug}`
 */

const DEFAULT_STORE_WEB_BASE = 'https://gatimitra.com'

function getShareOrigin(origin?: string | null): string {
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname
    // Local/dev: share the running site so the link is clickable while testing.
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin
    }
  }
  return (
    process.env.NEXT_PUBLIC_STORE_WEB_BASE_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    DEFAULT_STORE_WEB_BASE
  )
}

/**
 * Canonical shareable store URL (HTTPS) using the public SEO slug.
 */
export function buildMerchantDeepLink(
  publicSlug: string,
  origin?: string | null
): string {
  const slug = String(publicSlug ?? '').trim()
  const base = getShareOrigin(origin)
  if (!slug) return base
  return `${base}/restaurant/${encodeURIComponent(slug)}`
}

/** @deprecated Prefer buildMerchantDeepLink — same HTTPS merchant path. */
export function buildMerchantWebShareUrl(
  storePublicId: string,
  origin?: string | null
): string {
  return buildMerchantDeepLink(storePublicId, origin)
}

export type MerchantShareHints = {
  cuisines?: string[] | null
  rating?: number | null
  location?: string | null
}

function pickCuisineHook(cuisines?: string[] | null): string | null {
  const first = (cuisines ?? []).map((c) => String(c).trim()).filter(Boolean)[0]
  return first || null
}

/**
 * Short Zomato-style share line + HTTPS deep link.
 * e.g. "Hey, check out Hot Chappathis on GatiMitra. Order now!\nhttps://gatimitra.com/restaurant/hot-chappathis-thirupur"
 */
export function buildMerchantShareMessage(
  storeName: string,
  deepLink: string,
  hints?: MerchantShareHints | null
): string {
  const name = storeName.trim() || 'this spot'
  const cuisine = pickCuisineHook(hints?.cuisines)
  const rating =
    hints?.rating != null && Number.isFinite(hints.rating) && hints.rating > 0
      ? Number(hints.rating).toFixed(1)
      : null

  let hook: string
  if (cuisine && rating) {
    hook = `Hey, check out ${cuisine} favourites at ${name} (${rating}★) on GatiMitra. Order now!`
  } else if (cuisine) {
    hook = `Hey, craving ${cuisine}? Check out ${name} on GatiMitra. Order now!`
  } else if (rating) {
    hook = `Hey, check out ${name} (${rating}★) on GatiMitra. Order now!`
  } else {
    hook = `Hey, check out ${name} on GatiMitra. Order now!`
  }

  return `${hook}\n${deepLink}`
}
