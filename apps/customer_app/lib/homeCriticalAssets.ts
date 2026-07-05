import { Image } from "expo-image";
import type { AppAssetItem } from "@/services/appAssets.service";
import { CX } from "@/lib/appAssetKeys";

/** CMS images required for a fully painted home tab (no placeholder flash). */
export const HOME_CRITICAL_ASSET_KEYS = [
  CX.home.serviceFood,
  CX.home.serviceRide,
  CX.home.serviceParcel,
  CX.home.serviceEcommerce,
  CX.home.serviceVoucher,
  CX.home.serviceLocation,
  CX.home.brandBanner,
  CX.home.promoOffer,
  CX.home.promoOffer2,
] as const;

const prefetchedUris = new Set<string>();

export async function prefetchCriticalHomeAssetImages(
  assets: Record<string, AppAssetItem>
): Promise<void> {
  const tasks = HOME_CRITICAL_ASSET_KEYS.map(async (key) => {
    const uri = assets[key]?.url?.trim();
    if (!uri || prefetchedUris.has(uri)) return;
    prefetchedUris.add(uri);
    await Image.prefetch(uri, { cachePolicy: "memory-disk" });
  });
  await Promise.allSettled(tasks);
}
