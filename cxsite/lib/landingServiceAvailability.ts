import type { LandingArcItem } from '@/components/home/LandingHeroArc'

export type GeoEnabledServices = {
  food: boolean
  ride: boolean
  parcels: boolean
}

/** Same as customer app HomeServicesRow — never geo-enabled on web home. */
export const LANDING_ALWAYS_DISABLED_TITLES = new Set(['Shop', 'Deals', 'Near me'])

export function isLandingArcItemEnabled(
  item: LandingArcItem,
  enabledServices: GeoEnabledServices
): boolean {
  if (LANDING_ALWAYS_DISABLED_TITLES.has(item.title)) return false
  if (item.service === 'food') return enabledServices.food
  if (item.service === 'person') return enabledServices.ride
  if (item.service === 'parcel') return enabledServices.parcels
  return false
}

export function firstEnabledLandingArcIndex(
  items: LandingArcItem[],
  enabledServices: GeoEnabledServices
): number {
  const idx = items.findIndex((item) => isLandingArcItemEnabled(item, enabledServices))
  return idx >= 0 ? idx : 0
}
