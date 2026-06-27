/**
 * Turn DB `image_url` values into a usable browser `src`.
 * Fixes relative paths that break on nested routes (e.g. /order + img/x.png → /order/img/x.png).
 *
 * Partner attachment URLs are often stored as `/api/attachments/proxy?key=...` (same path as on
 * partner.gatimitra.com). On this app that hits localhost and 404s — rewrite to partner origin.
 */
const PARTNER_ORIGIN =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_PARTNER_URL?.replace(/\/$/, '')) ||
  'https://partner.gatimitra.com'

export function normalizeCategoryImageUrl(
  raw: string | null | undefined
): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null

  if (/^https?:\/\//i.test(s)) return s

  /** e.g. /api/attachments/proxy?key=user-app-categories%2F... */
  if (/^\/?api\/attachments\/proxy(\?|$)/i.test(s)) {
    const pathAndQuery = s.startsWith('/') ? s : `/${s}`
    return `${PARTNER_ORIGIN}${pathAndQuery}`
  }

  if (s.startsWith('//')) return `https:${s}`

  let path = s.replace(/^\/+/, '')

  if (/^public\//i.test(path)) {
    path = path.replace(/^public\//i, '')
  }

  // "biryani.png" or "Biryani.png" only → assume `public/img/` assets
  if (/^[^/\\]+\.(png|jpe?g|webp|gif|svg|avif)$/i.test(path)) {
    path = `img/${path}`
  }

  const storageRelative = path.replace(/^\/+/, '')
  if (storageRelative.startsWith('storage/')) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || ''
    if (base) return `${base}/${storageRelative}`
  }

  if (!path.startsWith('/')) path = `/${path}`
  return path
}
