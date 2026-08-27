export const APP_STATIC_ASSET_APPS = ["customer", "rider", "merchant"] as const;
export type AppStaticAssetApp = (typeof APP_STATIC_ASSET_APPS)[number];

export function parseAppStaticAssetApp(value: string): AppStaticAssetApp | null {
  const v = value.trim().toLowerCase();
  return APP_STATIC_ASSET_APPS.includes(v as AppStaticAssetApp) ? (v as AppStaticAssetApp) : null;
}

export function appStaticAssetAppLabel(app: AppStaticAssetApp): string {
  if (app === "customer") return "Customer";
  if (app === "rider") return "Rider";
  return "Merchant";
}

export const APP_STATIC_VIDEO_ASSET_IDS = new Set([
  "merchant.onboarding.packaging_tips_video",
]);

export function isAppStaticVideoAsset(id: string): boolean {
  return APP_STATIC_VIDEO_ASSET_IDS.has(id);
}

export const RIDE_HOME_BANNER_SLOT_IDS = [
  "customer.ride.banner",
  "customer.ride.banner_2",
  "customer.ride.banner_3",
  "customer.ride.banner_4",
  "customer.ride.banner_5",
  "customer.ride.banner_6",
] as const;

export const RIDE_HOME_BANNER_SLOT_ID_SET = new Set<string>(RIDE_HOME_BANNER_SLOT_IDS);

export function isRideHomeBannerSlot(id: string): boolean {
  return RIDE_HOME_BANNER_SLOT_ID_SET.has(id);
}
