/** Customer app — Google Play. */
export const CUSTOMER_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.gatimitra.customer&pcampaignid=web_share'

/** Static paths (copied from `img/` → `public/img/` by scripts/sync-public-img.mjs). */
export const CUSTOMER_APP_SCREEN_IMG = '/img/dnscreen.png'
export const RIDE_APP_SCREEN_IMG = '/img/ride.png'
/** Parcel marketing hero — local fallback when CMS asset unavailable. */
export const PARCEL_HERO_FALLBACK_IMG = '/img/parcel-van.jpg'

/** Brand green used in marketing email header / CTAs (not red). */
export const APP_LINK_EMAIL_BRAND = '#109D4C'

export const APP_LINK_SENT_TOAST =
  'Almost there! 📲 Your GatiMitra app link has been sent. Tap it on your phone to download and get started.'

export function resolveAndroidDownloadUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL?.trim()
  if (!fromEnv) return CUSTOMER_PLAY_STORE_URL
  // Bare Play Store homepage — use the customer app listing instead.
  if (
    fromEnv === 'https://play.google.com/store' ||
    fromEnv === 'https://play.google.com/store/'
  ) {
    return CUSTOMER_PLAY_STORE_URL
  }
  return fromEnv
}

export function resolveIosDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL?.trim() || 'https://www.apple.com/app-store/'
  )
}
