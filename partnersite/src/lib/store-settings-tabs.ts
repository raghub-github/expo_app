export const STORE_SETTINGS_TAB_LABELS: Record<string, string> = {
  plans: 'Plans & Subscription',
  premium: 'Premium Plans',
  timings: 'Outlet Timings',
  operations: 'Store Operations',
  'menu-capacity': 'Menu & Capacity',
  delivery: 'Delivery & Riders',
  address: 'Store Address',
  pos: 'POS Integration',
  notifications: 'Notifications',
  audit: 'Audit & Activity',
  gatimitra: 'Store on GatiMitra',
}

export function storeSettingsTabLabel(tab: string): string {
  return STORE_SETTINGS_TAB_LABELS[tab] ?? 'Store Settings'
}

export function buildStoreSettingsBreadcrumbs(
  activeTab: string,
  storeId?: string | null
): Array<{ label: string; href?: string }> {
  const params = new URLSearchParams()
  if (storeId?.trim()) params.set('storeId', storeId.trim())
  const settingsHref = `/partners/store-settings${params.toString() ? `?${params.toString()}` : ''}`

  return [
    { label: 'Partner', href: '/partners/dashboard' },
    { label: 'Settings', href: settingsHref },
    { label: storeSettingsTabLabel(activeTab) },
  ]
}

/** Public customer store page (main site, not partner subdomain). */
export function buildGatimitraCustomerStoreUrl(storeId: string): string {
  const slug = storeId.trim()
  return `https://gatimitra.com/restaurant/${encodeURIComponent(slug)}?from=around-you&location=India`
}
