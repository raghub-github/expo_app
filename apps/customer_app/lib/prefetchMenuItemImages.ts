import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  enqueueImagePrefetch,
  isImagePrefetchRequested,
  prefetchImagesNow,
} from "@/lib/prefetchQueue";

/**
 * Above-the-fold batch, awaited so the first screen of the menu paints warm.
 * 48 was the old value but it was fired as 48 simultaneous requests; the shared
 * queue now caps in-flight work, so the number is a batch size, not a fan-out.
 */
const PRIORITY_PREFETCH_COUNT = 12;

/**
 * Everything past the priority batch is queued lazily and hard-capped. A large
 * menu previously enqueued one `Image.prefetch` per item with no ceiling — a
 * 300-item menu meant 300 concurrent downloads and decodes on open.
 */
const BACKGROUND_PREFETCH_COUNT = 36;

function resolveMenuImageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  return toAbsoluteImageUrl(imageUrl) ?? imageUrl;
}

export function isMenuItemImagePrefetched(uri: string | null | undefined): boolean {
  if (!uri?.trim()) return false;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  return isImagePrefetchRequested(resolved);
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
