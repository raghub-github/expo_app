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
