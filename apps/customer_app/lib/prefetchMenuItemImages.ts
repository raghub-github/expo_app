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

/** First screen of menu rows — warm these only. Rest wait for viewport / scroll. */
export const MENU_EAGER_IMAGE_COUNT = 6;
const PRIORITY_PREFETCH_COUNT = MENU_EAGER_IMAGE_COUNT;

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
  // Above-fold only — never dump the whole catalogue into the download queue.
  enqueueImagePrefetch(collectMenuImageUris(menu), PRIORITY_PREFETCH_COUNT);
}

/**
 * Warm only the first viewport of menu thumbnails.
 * Below-fold images load when ViewportGate / viewability brings them near screen.
 */
export async function prefetchMenuItemImagesForMenu(menu: MenuItem[]): Promise<void> {
  const uris = collectMenuImageUris(menu);
  if (uris.length === 0) return;
  const priority = uris.slice(0, PRIORITY_PREFETCH_COUNT);
  await prefetchImagesNow(priority, PRIORITY_PREFETCH_COUNT);
}

/** Fire-and-forget warm for a single visible row (FlashList mount). */
export function ensureMenuItemImageWarm(uri: string | null | undefined): void {
  if (!uri?.trim()) return;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  void prefetchImageUriNow(resolved);
}

/**
 * Predictive prefetch from FlatList viewability — warm visible + next rows only.
 * Does not download the entire menu catalogue.
 */
export function prefetchMenuItemImagesAround(
  menu: MenuItem[],
  fromIndex: number,
  ahead = 6
): void {
  if (!menu.length) return;
  const start = Math.max(0, fromIndex);
  const end = Math.min(menu.length, start + ahead + 1);
  const uris: string[] = [];
  const seen = new Set<string>();
  for (let i = start; i < end; i++) {
    const uri = resolveMenuImageUri(menu[i]?.imageUrl);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  if (uris.length) enqueueImagePrefetchFront(uris, uris.length);
}
