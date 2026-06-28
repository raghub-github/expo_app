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
