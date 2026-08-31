import { Image } from "expo-image";
import type { AppAssetItem } from "@/services/appAssets.service";
import { CX } from "@/lib/appAssetKeys";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

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

function prefetchUrisForAsset(item: AppAssetItem | undefined): void {
  if (!item) return;
  // Stable proxy URL hits expo-image disk cache; signed URLs rotate and miss.
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

export async function prefetchCriticalHomeAssetImages(
  assets: Record<string, AppAssetItem>
): Promise<void> {
  for (const key of HOME_CRITICAL_ASSET_KEYS) {
    prefetchUrisForAsset(assets[key]);
  }
}

/** Sync warm when assets are already in the store (home services grid mount). */
export function prefetchCriticalHomeAssetImagesSync(
  assets: Record<string, AppAssetItem>
): void {
  for (const key of HOME_CRITICAL_ASSET_KEYS) {
    prefetchUrisForAsset(assets[key]);
  }
}
