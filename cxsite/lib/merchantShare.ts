/**
 * Merchant share helpers — keep path in sync with merchant/customer apps:
 * `{base}/home/merchant/{storePublicId}`
 * (see `apps/merchant_app` storeWebBaseUrl share + `apps/customer_app/lib/merchantShare.ts`)
 */

const DEFAULT_STORE_WEB_BASE = 'https://www.gatimitra.com'

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
 * Canonical shareable store deep link (HTTPS).
 * Opens store page on web; same path the customer app resolves for merchant.
 */
export function buildMerchantDeepLink(
  storePublicId: string,
  origin?: string | null
): string {
  const id = String(storePublicId ?? '').trim()
  const base = getShareOrigin(origin)
  if (!id) return base
  // Do not URI-encode plain public ids (GMMC1025) — matches merchant/customer share.
  return `${base}/home/merchant/${id}`
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
 * e.g. "Hey, check out Hot Chappathis on GatiMitra. Order now!\nhttps://www.gatimitra.com/home/merchant/GMMC1025"
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
