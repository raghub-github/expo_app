/**
 * Local / LAN dev: set in `.env.local` (restart `npm run dev` after changing):
 *
 *   NEXT_PUBLIC_API_ORIGIN=http://192.168.x.x:3003
 *
 * Use the same host:port you open in the browser (especially on a phone on Wi‑Fi).
 * If unset, requests stay relative to the current page (fine for localhost-only).
 *
 * Stale LAN IPs (machine IP changed) used to send OTP/auth to a dead host and
 * hang until timeout — we fall back to same-origin when the page host differs.
 */
export function clientApiUrl(path: string): string {
  if (typeof window === 'undefined') return path
  const p = path.startsWith('/') ? path : `/${path}`
  if (path.startsWith('http')) return path

  const base = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, '')
  if (!base) return p

  try {
    const apiHost = new URL(base).hostname
    const pageHost = window.location.hostname
    const pageIsLoopback = pageHost === 'localhost' || pageHost === '127.0.0.1'
    const apiIsLoopback = apiHost === 'localhost' || apiHost === '127.0.0.1'

    // Browser on localhost but origin points at an old LAN IP → use relative URLs
    if (pageIsLoopback && !apiIsLoopback && apiHost !== pageHost) {
      return p
    }
    // Browser on LAN IP A but origin set to LAN IP B
    if (!pageIsLoopback && !apiIsLoopback && apiHost !== pageHost) {
      return p
    }
  } catch {
    return p
  }

  return `${base}${p}`
}
