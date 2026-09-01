import type { LandingArcItem } from '@/components/home/LandingHeroArc'

export type GeoEnabledServices = {
  food: boolean
  ride: boolean
  parcels: boolean
  grocery: boolean
}

/** Shop / Near me stay disabled on web home until product-ready. */
export const LANDING_ALWAYS_DISABLED_TITLES = new Set(['Shop', 'Near me'])

export function isLandingArcItemEnabled(
  item: LandingArcItem,
  enabledServices: GeoEnabledServices
): boolean {
  if (LANDING_ALWAYS_DISABLED_TITLES.has(item.title)) return false
  if (item.title === 'Grocery') return enabledServices.grocery
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

/** Arc bottom → top: active first (low indices), inactive last (high indices). */
export function landingArcDisplayOrder(
  items: LandingArcItem[],
  enabledServices: GeoEnabledServices
): number[] {
  const indices = items.map((_, i) => i)
  const isEnabled = (i: number) => isLandingArcItemEnabled(items[i], enabledServices)
  return indices.sort((a, b) => {
    const ea = isEnabled(a)
    const eb = isEnabled(b)
    if (ea === eb) return a - b
    return ea ? -1 : 1
  })
}
