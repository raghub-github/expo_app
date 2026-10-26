import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { sizedImageUrl } from "@/lib/imageSizing";
import {
  enqueueImagePrefetch,
  enqueueImagePrefetchFront,
  isImagePrefetchCompleted,
  isImagePrefetchRequested,
  prefetchImagesNow,
  prefetchImageUriNow,
} from "@/lib/prefetchQueue";

/** First screen of menu rows — warm these before the rest of the queue. */
const PRIORITY_PREFETCH_COUNT = 12;

/** Background queue after priority batch. */
const BACKGROUND_PREFETCH_COUNT = 24;

/** Matches StoreMenuItemRow thumbnail width so store-open hits memory-disk. */
const MENU_ROW_IMAGE_WIDTH = 128;

function resolveMenuImageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  const abs = toAbsoluteImageUrl(imageUrl) ?? imageUrl;
  return sizedImageUrl(abs, MENU_ROW_IMAGE_WIDTH) ?? abs;
}

export function isMenuItemImagePrefetched(uri: string | null | undefined): boolean {
  if (!uri?.trim()) return false;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  return isImagePrefetchCompleted(resolved) || isImagePrefetchRequested(resolved);
}

export function isMenuItemImageReady(uri: string | null | undefined): boolean {
  if (!uri?.trim()) return false;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  return isImagePrefetchCompleted(resolved);
}

function collectMenuImageUris(menu: MenuItem[]): string[] {
  const uris: string[] = [];
  const seen = new Set<string>();
  for (const item of menu) {
    const uri = resolveMenuImageUri(item.imageUrl);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  return uris;
}

export function prefetchMenuItemImages(menu: MenuItem[]): void {
  enqueueImagePrefetch(collectMenuImageUris(menu), BACKGROUND_PREFETCH_COUNT);
}

/** Priority batch awaited (above-fold), the rest jumped to the front of the queue. */
export async function prefetchMenuItemImagesForMenu(menu: MenuItem[]): Promise<void> {
  const uris = collectMenuImageUris(menu);
  if (uris.length === 0) return;

  const priority = uris.slice(0, PRIORITY_PREFETCH_COUNT);
  const rest = uris.slice(PRIORITY_PREFETCH_COUNT);
  // Start the first screen immediately, and put the next rows ahead of home banners.
  enqueueImagePrefetchFront(rest, BACKGROUND_PREFETCH_COUNT);
  await prefetchImagesNow(priority, PRIORITY_PREFETCH_COUNT);
}

/** Fire-and-forget warm for a single visible row (FlashList mount). */
export function ensureMenuItemImageWarm(uri: string | null | undefined): void {
  if (!uri?.trim()) return;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  void prefetchImageUriNow(resolved);
}
