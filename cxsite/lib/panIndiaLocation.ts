import type { LocationState } from '@/components/providers/LocationProvider'

/**
 * When the user is browsing “all of India”, we must not send lat/lon to listing APIs
 * even if coords exist in context (e.g. old sessions).
 */
export function isPanIndiaLocationDisplay(displayName: string): boolean {
  const n = displayName.replace(/^📍\s*/i, '').trim().toLowerCase()
  return n === '' || n === 'india' || n === 'all india' || n === 'bharat'
}

/**
 * Pan‑India browse mode: user has not committed a delivery address (or picked India).
 * Auto GPS / profile hints must not disable Food/Ride or filter brand listings.
 */
export function isPanIndiaBrowsingMode(location: Pick<LocationState, 'displayName' | 'locationCommittedByUser'>): boolean {
  if (location.locationCommittedByUser !== true) return true
  return isPanIndiaLocationDisplay(location.displayName)
}
/** True when a saved row is only the pan‑India placeholder (not a real address). */
export function isPanIndiaSavedRow(locationName: string, city?: string): boolean {
  const name = (locationName || '').trim()
  const c = (city || '').trim()
  if (!name && !c) return false
  const composed = name && c ? `${name}, ${c}` : name || c
  return isPanIndiaLocationDisplay(composed)
}

/** Order page header / section label — pan‑India until the user commits a delivery address. */
export function resolveOrderPageLocationLabel(args: {
  locationCommittedByUser: boolean
  displayName: string
}): string {
  if (!args.locationCommittedByUser) return 'India'
  const name = args.displayName.replace(/^📍\s*/i, '').trim()
  if (name && !isPanIndiaLocationDisplay(name)) return name
  return 'India'
}
