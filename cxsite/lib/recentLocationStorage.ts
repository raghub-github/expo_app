/**
 * Device-local “Recently used” locations for the location sheet.
 * Shared by LocationProvider (auto GPS / picks) and LocationSheet.
 */
import type { LocationItem } from '@/components/location-search/LocationPopup'
import { RECENT_LOCATIONS_UI_MAX } from '@/lib/recentLocationsLimit'
import {
  readRecentHistoryCache,
  writeRecentHistoryCache,
} from '@/lib/locationListCache'

export const RECENT_GUEST_KEY = 'gatimitra_recent_locations_v1'
export const SELECTED_LOCATION_KEY = 'gatimitra_last_selected_location_v1'
/** Legacy current-location blob still read by LocationSheet. */
export const CURRENT_LOCATION_KEY = 'gatimitra_location_v1'

export function locationItemFromDisplayName(
  displayName: string,
  lat: number | null | undefined,
  lon: number | null | undefined,
  extras?: { area?: string; city?: string; id?: number }
): LocationItem {
  const parts = displayName
    .replace(/^📍\s*/, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const area = (extras?.area || parts[0] || displayName).trim()
  const city =
    (extras?.city || (parts.length > 1 ? parts.slice(1).join(', ') : '')).trim()
  return {
    id: extras?.id ?? -1,
    location_name: area || displayName,
    city,
    latitude: typeof lat === 'number' ? lat : 0,
    longitude: typeof lon === 'number' ? lon : 0,
    label: 'CURRENT LOCATION',
  }
}

export function readGuestRecent(): LocationItem[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RECENT_GUEST_KEY) : null
    const parsed = raw ? (JSON.parse(raw) as LocationItem[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LOCATIONS_UI_MAX) : []
  } catch {
    return []
  }
}

function dedupePush(list: LocationItem[], item: LocationItem): LocationItem[] {
  const key = `${item.location_name}|${item.city || ''}`.toLowerCase()
  const filtered = list.filter(
    (l) => `${l.location_name}|${l.city || ''}`.toLowerCase() !== key
  )
  return [item, ...filtered].slice(0, RECENT_LOCATIONS_UI_MAX)
}

export function pushGuestRecent(item: LocationItem): LocationItem[] {
  try {
    const next = dedupePush(readGuestRecent(), item)
    window.localStorage.setItem(RECENT_GUEST_KEY, JSON.stringify(next))
    return next
  } catch {
    return [item]
  }
}

function mirrorIntoAuthRecentCaches(item: LocationItem) {
  if (typeof window === 'undefined') return
  try {
    const prefix = 'gatimitra_address_history_cache_v1_'
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const customerId = Number(key.slice(prefix.length))
      if (!Number.isFinite(customerId)) continue
      const existing = readRecentHistoryCache(customerId) ?? []
      writeRecentHistoryCache(customerId, dedupePush(existing, item))
    }
  } catch {
    // ignore
  }
}

/** Persist active pin so sheet “CURRENT LOCATION” + recent stay in sync. */
export function persistActiveLocationPin(args: {
  displayName: string
  lat: number | null
  lon: number | null
  area?: string
  city?: string
  customerId?: number
}) {
  if (typeof window === 'undefined') return
  const { displayName, lat, lon, area, city, customerId } = args
  if (!displayName.trim() || displayName.trim().toLowerCase() === 'india') return

  const item = locationItemFromDisplayName(displayName, lat, lon, { area, city })
  try {
    window.localStorage.setItem(
      CURRENT_LOCATION_KEY,
      JSON.stringify({ displayName, lat, lon, savedAt: Date.now() })
    )
  } catch {
    // ignore
  }
  pushGuestRecent(item)
  if (typeof customerId === 'number' && Number.isFinite(customerId)) {
    const existing = readRecentHistoryCache(customerId) ?? []
    writeRecentHistoryCache(customerId, dedupePush(existing, item))
  } else {
    mirrorIntoAuthRecentCaches(item)
  }
}
