import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  enqueueImagePrefetch,
  isImagePrefetchCompleted,
  isImagePrefetchRequested,
  prefetchImagesNow,
  prefetchImageUriNow,
} from "@/lib/prefetchQueue";

/** Above-the-fold batch — keep small to avoid decode heat / OOM on store open. */
const PRIORITY_PREFETCH_COUNT = 8;

/** Background queue after priority batch. */
const BACKGROUND_PREFETCH_COUNT = 24;

function resolveMenuImageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  return toAbsoluteImageUrl(imageUrl) ?? imageUrl;
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

/** Priority batch awaited (above-fold), the rest queued — no duplicate downloads. */
export async function prefetchMenuItemImagesForMenu(menu: MenuItem[]): Promise<void> {
  const uris = collectMenuImageUris(menu);
  if (uris.length === 0) return;

  await prefetchImagesNow(uris.slice(0, PRIORITY_PREFETCH_COUNT), PRIORITY_PREFETCH_COUNT);
  enqueueImagePrefetch(uris.slice(PRIORITY_PREFETCH_COUNT), BACKGROUND_PREFETCH_COUNT);
}

/** Fire-and-forget warm for a single visible row (FlashList mount). */
export function ensureMenuItemImageWarm(uri: string | null | undefined): void {
  if (!uri?.trim()) return;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  void prefetchImageUriNow(resolved);
}
