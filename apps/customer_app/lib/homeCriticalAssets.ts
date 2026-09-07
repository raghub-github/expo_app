import type { AppAssetItem } from "@/services/appAssets.service";
import { CX } from "@/lib/appAssetKeys";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { enqueueImagePrefetchFront, prefetchImagesNow } from "@/lib/prefetchQueue";

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

function collectUrisForAsset(item: AppAssetItem | undefined, into: string[]): void {
  if (!item) return;
  // Stable proxy URL hits expo-image disk cache; signed URLs rotate and miss.
  const candidates = [item.proxyUrl, item.url];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const uri = toAbsoluteImageUrl(trimmed) ?? trimmed;
    if (!uri || into.includes(uri)) continue;
    into.push(uri);
  }
}

export function collectCriticalHomeAssetUris(assets: Record<string, AppAssetItem>): string[] {
  const uris: string[] = [];
  for (const key of HOME_CRITICAL_ASSET_KEYS) {
    collectUrisForAsset(assets[key], uris);
  }
  return uris;
}

export async function prefetchCriticalHomeAssetImages(
  assets: Record<string, AppAssetItem>
): Promise<void> {
  const uris = collectCriticalHomeAssetUris(assets);
  if (uris.length === 0) return;
  await prefetchImagesNow(uris, uris.length);
}

/** Sync warm when assets are already in the store (home services grid mount). */
export function prefetchCriticalHomeAssetImagesSync(
  assets: Record<string, AppAssetItem>
): void {
  const uris = collectCriticalHomeAssetUris(assets);
  if (uris.length === 0) return;
  enqueueImagePrefetchFront(uris, uris.length);
}
