/** In-memory + session listing cache so /order remounts still paint stores immediately. */

const SS_KEY = 'gm_order_restaurants_v1'

let lastRestaurantQuery = ''
let lastRestaurantList: unknown[] = []

function restoreFromSession(): unknown[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { query?: string; list?: unknown[] }
    if (!Array.isArray(parsed.list) || parsed.list.length === 0) return []
    lastRestaurantQuery = typeof parsed.query === 'string' ? parsed.query : ''
    lastRestaurantList = parsed.list
    return parsed.list
  } catch {
    return []
  }
}

export function readCachedOrderRestaurants(query?: string): unknown[] {
  if (lastRestaurantList.length === 0) restoreFromSession()
  if (query && query === lastRestaurantQuery && lastRestaurantList.length > 0) {
    return lastRestaurantList
  }
  return lastRestaurantList.length > 0 ? lastRestaurantList : []
}

export function writeCachedOrderRestaurants(query: string, list: unknown[]): void {
  lastRestaurantQuery = query
  lastRestaurantList = Array.isArray(list) ? list : []
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ query, list: lastRestaurantList }))
  } catch {
    /* quota / private mode */
  }
}

let lastServiceKey = ''
let lastServiceOk: boolean | null = null

export function readCachedServiceArea(key: string): boolean | null {
  if (key && key === lastServiceKey) return lastServiceOk
  return lastServiceKey ? lastServiceOk : null
}

export function writeCachedServiceArea(key: string, ok: boolean): void {
  lastServiceKey = key
  lastServiceOk = ok
}
