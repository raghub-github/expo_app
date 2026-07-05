import { Image } from "expo-image";
import type { AppAssetItem } from "@/services/appAssets.service";
import { CX } from "@/lib/appAssetKeys";

/** CMS images for ride home — promo, services grid, safety strip. */
export const RIDE_CRITICAL_ASSET_KEYS = [
  CX.ride.banner,
  CX.ride.bottomBanner,
  CX.ride.auto,
  CX.ride.cab,
  CX.ride.cabPremium,
  CX.ride.bike,
  CX.home.promoRideOffer1,
  CX.home.promoRideOffer2,
] as const;

const prefetchedUris = new Set<string>();

export async function prefetchCriticalRideAssetImages(
  assets: Record<string, AppAssetItem>
): Promise<void> {
  const tasks = RIDE_CRITICAL_ASSET_KEYS.map(async (key) => {
    const uri = assets[key]?.url?.trim();
    if (!uri || prefetchedUris.has(uri)) return;
    prefetchedUris.add(uri);
    await Image.prefetch(uri, { cachePolicy: "memory-disk" });
  });
  await Promise.allSettled(tasks);
}

/** Sync warm when assets are already in the store (ride screen mount). */
export function prefetchCriticalRideAssetImagesSync(
  assets: Record<string, AppAssetItem>
): void {
  for (const key of RIDE_CRITICAL_ASSET_KEYS) {
    const uri = assets[key]?.url?.trim();
    if (!uri || prefetchedUris.has(uri)) continue;
    prefetchedUris.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}
