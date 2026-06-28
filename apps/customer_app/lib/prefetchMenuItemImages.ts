import { Image } from "expo-image";
import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const prefetchedUris = new Set<string>();
const PRIORITY_PREFETCH_COUNT = 48;

function resolveMenuImageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  return toAbsoluteImageUrl(imageUrl) ?? imageUrl;
}

export function isMenuItemImagePrefetched(uri: string | null | undefined): boolean {
  if (!uri?.trim()) return false;
  const resolved = toAbsoluteImageUrl(uri) ?? uri;
  return prefetchedUris.has(resolved);
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
  for (const uri of collectMenuImageUris(menu)) {
    if (prefetchedUris.has(uri)) continue;
    prefetchedUris.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}

async function prefetchUrisAwait(uris: string[]): Promise<void> {
  const pending = uris.filter((uri) => {
    if (prefetchedUris.has(uri)) return false;
    prefetchedUris.add(uri);
    return true;
  });
  if (pending.length === 0) return;
  await Promise.all(
    pending.map((uri) =>
      Image.prefetch(uri, { cachePolicy: "memory-disk" }).catch(() => undefined)
    )
  );
}

/** Priority batch first (above-fold), rest in background — no duplicate downloads. */
export async function prefetchMenuItemImagesForMenu(menu: MenuItem[]): Promise<void> {
  const uris = collectMenuImageUris(menu);
  if (uris.length === 0) return;

  const priority = uris.slice(0, PRIORITY_PREFETCH_COUNT);
  const rest = uris.slice(PRIORITY_PREFETCH_COUNT);

  await prefetchUrisAwait(priority);
  if (rest.length > 0) {
    void prefetchUrisAwait(rest);
  }
}
