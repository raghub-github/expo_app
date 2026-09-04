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
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
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
 * Gallery is intentionally excluded so banners win the network/cache slot.
 */
export function prefetchMerchantPrimaryBanners(
  merchants: Array<MerchantSummary | { banner_url?: string | null; displayImage?: string | null; galleryImages?: string[]; imageUrl?: string | null }>,
  opts?: { limit?: number }
): void {
  const limit = opts?.limit ?? 60;
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of merchants) {
    if (urls.length >= limit) break;
    const banner = resolveMerchantBannerUri(m as MerchantSummary);
    if (!banner || seen.has(banner)) continue;
    seen.add(banner);
    urls.push(banner);
  }
  if (urls.length === 0) return;
  void Promise.allSettled(urls.map((uri) => prefetchUriNow(uri)));
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
  prefetchMerchantPrimaryBanners(list, { limit: 60 });

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
