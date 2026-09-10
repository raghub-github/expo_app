/**
 * Central image loading defaults — expo-image memory-disk cache + prefetch.
 * Banner images are always warmed first (instant list cards); gallery can lag.
 */

import { Image } from "expo-image";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  collectMerchantBannerUris,
  resolveMerchantBannerUri,
} from "@/lib/merchantBanner";
import { resolveMerchantFoodHeroPrimaryUri } from "@/lib/merchantHeroMedia";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";
import type { MerchantSummary } from "@/services/merchant.service";

export const IMAGE_CACHE_POLICY = "memory-disk" as const;

const prefetched = new Set<string>();

export function resolveImageUri(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return toAbsoluteImageUrl(url.trim()) ?? url.trim();
}

function prefetchUriNow(uri: string): Promise<boolean> {
  if (prefetched.has(uri)) {
    markHeroMediaSessionReady(uri);
    return Promise.resolve(true);
  }
  prefetched.add(uri);
  return Image.prefetch(uri, { cachePolicy: IMAGE_CACHE_POLICY })
    .then(() => {
      markHeroMediaSessionReady(uri);
      return true;
    })
    .catch(() => {
      // Allow a later retry if this attempt failed.
      prefetched.delete(uri);
      return false;
    });
}

/** Prefetch URIs into disk+memory. Deduped per process. Marks session-ready on success. */
export function prefetchImages(
  urls: Array<string | null | undefined>,
  opts?: { priority?: "low" | "normal" | "high"; limit?: number }
): void {
  const limit = opts?.limit ?? 48;
  const resolved: string[] = [];
  for (const url of urls) {
    const uri = resolveImageUri(url);
    if (!uri) continue;
    if (resolved.includes(uri)) continue;
    resolved.push(uri);
    if (resolved.length >= limit) break;
  }
  if (resolved.length === 0) return;

  const run = () => {
    void Promise.allSettled(resolved.map((uri) => prefetchUriNow(uri)));
  };

  if (opts?.priority === "high") {
    run();
    return;
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(run, opts?.priority === "low" ? 120 : 0);
    });
  } else {
    setTimeout(run, opts?.priority === "low" ? 120 : 0);
  }
}

/**
 * Primary banner only — one URI per store. Must be warm before list paint.
 * First N images prefetch immediately (bypass concurrency queue); rest enqueue.
 */
export function prefetchMerchantPrimaryBanners(
  merchants: Array<MerchantSummary | { banner_url?: string | null; displayImage?: string | null; galleryImages?: string[]; imageUrl?: string | null }>,
  opts?: { limit?: number }
): void {
  const limit = opts?.limit ?? 16;
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of merchants) {
    if (urls.length >= limit * 2) break;
    const merchant = m as MerchantSummary;
    // Classic/grid card banner + discovery hero (may differ when logo is filtered).
    for (const candidate of [
      resolveMerchantBannerUri(merchant),
      resolveMerchantFoodHeroPrimaryUri(merchant),
    ]) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      urls.push(candidate);
    }
  }
  if (urls.length === 0) return;
  // Above-the-fold: fire Image.prefetch now so Food list paints from memory-disk.
  const hot = urls.slice(0, 16);
  void Promise.allSettled(hot.map((uri) => prefetchUriNow(uri)));
  if (urls.length > 16) {
    enqueueImagePrefetch(urls.slice(16), limit);
  }
}

/**
 * Prefetch list-card heroes as soon as merchant rows arrive.
 * 1) All primary banners immediately (instant cards)
 * 2) Gallery after a short delay (ok to lag)
 */
export function prefetchMerchantCardImages(
  merchants: Array<{
    displayImage?: string | null;
    banner_url?: string | null;
    galleryImages?: string[];
    imageUrl?: string | null;
  }>
): void {
  const list = merchants as MerchantSummary[];
  prefetchMerchantPrimaryBanners(list, { limit: 24 });

  // Gallery second-class — never steal bandwidth from banners on first paint.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const galleryUrls: Array<string | null | undefined> = [];
        for (const m of list.slice(0, 24)) {
          const collected = collectMerchantBannerUris(m);
          // Skip index 0 (primary banner) — already warmed above.
          for (let i = 1; i < collected.length; i++) galleryUrls.push(collected[i]);
        }
        prefetchImages(galleryUrls, { priority: "low", limit: 48 });
      }, 350);
    });
  }
}
