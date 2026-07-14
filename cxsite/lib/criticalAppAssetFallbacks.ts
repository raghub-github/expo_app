import { CX } from '@/lib/appAssetKeys'

/**
 * Known CMS proxy paths (same R2 keys as customer app / `app_static_assets`).
 * Used so logo + hero icons paint immediately if `/api/app-assets/customer` is slow.
 */
const BUNDLED = (slug: string) =>
  `/api/attachments/proxy?key=${encodeURIComponent(`app-static-assets/customer/${slug}/bundled.png`)}`

export const CRITICAL_APP_ASSET_FALLBACKS: Record<string, string> = {
  [CX.auth.logo]: BUNDLED('customer_auth_logo'),
  [CX.auth.logoWithName]: BUNDLED('customer_auth_logo_with_name'),
  // Prefer bundled marketing screenshots so download modal / home stay correct in prod
  // even if CMS R2 assets are slow or outdated (synced from `img/` → `public/img/`).
  [CX.home.brandBanner]: '/img/dnscreen.png',
  [CX.home.serviceFood]: BUNDLED('customer_home_service_food'),
  [CX.home.serviceRide]: BUNDLED('customer_home_service_ride'),
  [CX.home.serviceParcel]: BUNDLED('customer_home_service_parcel'),
  [CX.home.serviceEcommerce]: BUNDLED('customer_home_service_ecommerce'),
  [CX.home.serviceVoucher]: BUNDLED('customer_home_service_voucher'),
  [CX.home.serviceLocation]: BUNDLED('customer_home_service_location'),
  [CX.ride.banner]: '/img/ride.png',
  [CX.ride.bottomBanner]: BUNDLED('customer_ride_bottom_banner'),
  [CX.ride.bike]: BUNDLED('customer_ride_bike'),
  [CX.ride.auto]: BUNDLED('customer_ride_auto'),
  [CX.ride.cab]: BUNDLED('customer_ride_cab'),
  [CX.ride.cabPremium]: BUNDLED('customer_ride_cab_premium'),
}

export function criticalAppAssetFallback(assetKey: string): string | null {
  return CRITICAL_APP_ASSET_FALLBACKS[assetKey] ?? null
}
