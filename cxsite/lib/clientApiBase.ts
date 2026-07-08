/**
 * Local / LAN dev: set in `.env.local` (restart `npm run dev` after changing):
 *
 *   NEXT_PUBLIC_API_ORIGIN=http://192.168.x.x:3003
 *
 * Use the same host:port you open in the browser (especially on a phone on Wi‑Fi).
 * If unset, requests stay relative to the current page (fine for localhost-only).
 */
export function clientApiUrl(path: string): string {
  if (typeof window === 'undefined') return path
  const base = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, '')
  if (!base) return path
  if (path.startsWith('http')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
