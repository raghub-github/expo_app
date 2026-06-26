/**
 * Store detail URLs with ?from= so breadcrumbs can show where the user entered from.
 */
export const RESTAURANT_ENTRY_CRUMBS: Record<string, { href: string; label: string }> = {
  order: { href: '/order', label: 'Order' },
  'around-you': { href: '/around-you', label: 'Around you' },
  restaurants: { href: '/restaurants', label: 'Restaurants' },
  search: { href: '/location-search', label: 'Search' },
}

export function restaurantDetailHref(
  storeId: string,
  from?: string,
  extraQuery?: URLSearchParams | Record<string, string | number | null | undefined>
) {
  const base = `/restaurant/${encodeURIComponent(storeId)}`
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
