/**
 * Store detail URLs with ?from= so breadcrumbs can show where the user entered from.
 */
export const RESTAURANT_ENTRY_CRUMBS: Record<string, { href: string; label: string }> = {
  order: { href: '/order', label: 'Order' },
  'around-you': { href: '/around-you', label: 'Around you' },
  restaurants: { href: '/restaurants', label: 'Restaurants' },
  grocery: { href: '/grocery', label: 'Grocery' },
  search: { href: '/location-search', label: 'Search' },
}

export type RestaurantLinkStore = {
  public_slug?: string | null
  store_id?: string | null
  restaurant_id?: string | null
  id?: string | number | null
}

/** Public URL segment — always prefer public_slug. Never use internal store_id in public URLs. */
export function restaurantPublicSlugFromStore(
  store: RestaurantLinkStore | string | null | undefined
): string {
  if (store == null) return ''
  if (typeof store === 'string') {
    const s = store.trim()
    if (/^GMM[A-Z]*\d+$/i.test(s)) return ''
    return s
  }
  return String(store.public_slug ?? '').trim()
}

export function restaurantDetailHref(
  storeOrSlug: RestaurantLinkStore | string,
  from?: string,
  extraQuery?: URLSearchParams | Record<string, string | number | null | undefined>
) {
  const slug = restaurantPublicSlugFromStore(storeOrSlug)
  if (!slug) {
    const key = (from || '').toLowerCase().trim()
    if (key === 'grocery') return '/grocery'
    return '/order'
  }
  const base = `/restaurant/${encodeURIComponent(slug)}`
  const params = new URLSearchParams()
  if (from) {
    const key = from.toLowerCase().trim()
    if (RESTAURANT_ENTRY_CRUMBS[key]) params.set('from', key)
  }
  if (extraQuery instanceof URLSearchParams) {
    extraQuery.forEach((value, key) => {
      if (value != null && String(value).trim() !== '') params.set(key, String(value))
    })
  } else if (extraQuery && typeof extraQuery === 'object') {
    Object.entries(extraQuery).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') params.set(key, String(value))
    })
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function getRestaurantBreadcrumbMiddle(from?: string | null) {
  const key = (from || 'order').toLowerCase().trim()
  return RESTAURANT_ENTRY_CRUMBS[key] ?? RESTAURANT_ENTRY_CRUMBS.order
}
