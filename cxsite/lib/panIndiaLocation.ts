/**
 * When the user is browsing “all of India”, we must not send lat/lon to listing APIs
 * even if coords exist in context (e.g. old sessions).
 */
export function isPanIndiaLocationDisplay(displayName: string): boolean {
  const n = displayName.replace(/^📍\s*/i, '').trim().toLowerCase()
  return n === '' || n === 'india' || n === 'all india' || n === 'bharat'
}

/** True when a saved row is only the pan‑India placeholder (not a real address). */
export function isPanIndiaSavedRow(locationName: string, city?: string): boolean {
  const name = (locationName || '').trim()
  const c = (city || '').trim()
  if (!name && !c) return false
  const composed = name && c ? `${name}, ${c}` : name || c
  return isPanIndiaLocationDisplay(composed)
}
