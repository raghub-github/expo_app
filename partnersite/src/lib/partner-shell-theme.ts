/** Partner shell main-area background matches the dark sidebar on operational pages. */
export const PARTNER_DARK_MAIN_BG = '#011222';

const LIGHT_ROUTE_SUFFIXES = ['/dashboard', '/profile'] as const;

const DARK_ROUTE_SEGMENTS = new Set([
  'food-orders',
  'orders',
  'menu',
  'order-history',
  'offers',
  'payments',
  'user-insights',
  'support-inbox',
  'store-settings',
]);

/** Dashboard and Profile keep the light main canvas; other partner routes use the dark shell. */
export function isPartnerDarkContentRoute(pathname: string): boolean {
  const normalized = (pathname ?? '').replace(/\/$/, '') || '/';
  if (
    LIGHT_ROUTE_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(suffix),
    )
  ) {
    return false;
  }
  const parts = normalized.split('/').filter(Boolean);
  const segment = parts[0] === 'partners' || parts[0] === 'mx' ? parts[1] : parts[0];
  return segment ? DARK_ROUTE_SEGMENTS.has(segment) : false;
}
