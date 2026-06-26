import type { LocationItem } from '@/components/location-search/LocationPopup'

const savedListCacheKey = (customerId: number) => `gatimitra_saved_list_cache_v1_${customerId}`
const recentHistoryCacheKey = (customerId: number) => `gatimitra_address_history_cache_v1_${customerId}`

export function readSavedListCache(customerId: number): LocationItem[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(savedListCacheKey(customerId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocationItem[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeSavedListCache(customerId: number, rows: LocationItem[]) {
  try {
    localStorage.setItem(savedListCacheKey(customerId), JSON.stringify(rows))
  } catch {
    // ignore quota / private mode
  }
}

export function readRecentHistoryCache(customerId: number): LocationItem[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(recentHistoryCacheKey(customerId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocationItem[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeRecentHistoryCache(customerId: number, rows: LocationItem[]) {
  try {
    localStorage.setItem(recentHistoryCacheKey(customerId), JSON.stringify(rows))
  } catch {
    // ignore
  }
}

/** One background fetch after auth so the location sheet can hydrate saved addresses from the API. */
export function prefetchLocationListsForCustomer(customerId: number): void {
  if (!Number.isFinite(customerId)) return
  void fetch(`/api/locations/saved?customerId=${customerId}`)
    .then((r) => r.json())
    .then((saved) => {
      if (Array.isArray(saved) && saved.length > 0) writeSavedListCache(customerId, saved)
    })
    .catch(() => {})
}
