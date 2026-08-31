import { Image } from "expo-image";
import type { AppAssetItem } from "@/services/appAssets.service";
import { CX } from "@/lib/appAssetKeys";
import { RIDE_HOME_BANNER_KEYS } from "@/lib/rideHomeBannerSlots";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

/** CMS images for ride home — promo, services grid, safety strip. */
export const RIDE_CRITICAL_ASSET_KEYS = [
  ...RIDE_HOME_BANNER_KEYS,
  CX.ride.bottomBanner,
  CX.ride.auto,
  CX.ride.cab,
  CX.ride.cabPremium,
  CX.ride.bike,
  CX.ride.evAuto,
] as const;

const prefetchedUris = new Set<string>();

function prefetchUrisForAsset(item: AppAssetItem | undefined): void {
  if (!item) return;
  const candidates = [item.proxyUrl, item.url];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const uri = toAbsoluteImageUrl(trimmed) ?? trimmed;
    if (!uri || prefetchedUris.has(uri)) continue;
    prefetchedUris.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}

export async function prefetchCriticalRideAssetImages(
  assets: Record<string, AppAssetItem>
): Promise<void> {
  for (const key of RIDE_CRITICAL_ASSET_KEYS) {
    prefetchUrisForAsset(assets[key]);
  }
}

/** Sync warm when assets are already in the store (ride screen mount). */
export function prefetchCriticalRideAssetImagesSync(
  assets: Record<string, AppAssetItem>
): void {
  for (const key of RIDE_CRITICAL_ASSET_KEYS) {
    prefetchUrisForAsset(assets[key]);
  }
}
