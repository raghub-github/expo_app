/**
 * Central image loading defaults — expo-image memory-disk cache + prefetch.
 * Banner images are always warmed first (instant list cards); gallery can lag.
 */

import { Dimensions } from "react-native";
import { Image } from "expo-image";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  collectMerchantBannerUris,
  resolveMerchantBannerUri,
} from "@/lib/merchantBanner";
import { resolveMerchantFoodHeroPrimaryUri } from "@/lib/merchantHeroMedia";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";
import { sizedImageUrl } from "@/lib/imageSizing";
import type { MerchantSummary } from "@/services/merchant.service";

/**
 * Default width (layout points) to warm list-card banners at. Matches the
 * full-width food card; smaller cards (grid/discovery thumbs) request their own
 * derivative on first paint. Callers can override per surface.
 */
export const DEFAULT_CARD_PREFETCH_WIDTH = 400;

/** Widths the Food list actually paints — prefetch must match or expo-image misses cache. */
export function foodListCardPrefetchWidth(): number {
  return Math.max(280, Dimensions.get("window").width - 32);
}

export function foodRailCardPrefetchWidth(): number {
  const screenW = Dimensions.get("window").width;
  return Math.floor((screenW - 16 - 10) / 2.38);
}

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
  opts?: { limit?: number; width?: number }
): void {
  const limit = opts?.limit ?? 8;
  const width = opts?.width ?? foodListCardPrefetchWidth();
  const widths = [width];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of merchants) {
    if (urls.length >= limit * 4) break;
    const merchant = m as MerchantSummary;
    // Classic/grid card banner + discovery hero (may differ when logo is filtered).
    // Warm the SAME sized WebP derivatives the cards request — never the raw original.
    for (const w of widths) {
      for (const candidate of [
        sizedImageUrl(resolveMerchantBannerUri(merchant), w),
        sizedImageUrl(resolveMerchantFoodHeroPrimaryUri(merchant), w),
      ]) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        urls.push(candidate);
      }
    }
  }
  if (urls.length === 0) return;
  // Above-the-fold only. The rest wait so a long list cannot stampede the proxy.
  const hot = urls.slice(0, Math.min(8, limit));
  void Promise.allSettled(hot.map((uri) => prefetchUriNow(uri)));
  if (urls.length > hot.length) {
    enqueueImagePrefetch(urls.slice(hot.length), limit);
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
  }>,
  opts?: { width?: number; gallery?: boolean }
): void {
  const list = merchants as MerchantSummary[];
  const width = opts?.width ?? foodListCardPrefetchWidth();
  prefetchMerchantPrimaryBanners(list, { limit: 8, width });
  if (opts?.gallery === false) return;

  // Gallery second-class — never steal bandwidth from banners on first paint.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const galleryUrls: Array<string | null | undefined> = [];
        for (const m of list.slice(0, 24)) {
          const collected = collectMerchantBannerUris(m);
          // Skip index 0 (primary banner) — already warmed above. Size the rest.
          for (let i = 1; i < collected.length; i++) galleryUrls.push(sizedImageUrl(collected[i], width));
        }
        prefetchImages(galleryUrls, { priority: "low", limit: 48 });
      }, 350);
    });
  }
}

/**
 * First Food-home paint: the recommended rail and the first list cards only.
 * Both widths, immediately. A wider prefetch downloads originals the user
 * cannot see yet and keeps these banners blank.
 */
export function prefetchFoodHomeVisibleImages(
  merchants: Array<MerchantSummary | { banner_url?: string | null; displayImage?: string | null }>
): void {
  const listW = foodListCardPrefetchWidth();
  const railW = foodRailCardPrefetchWidth();
  const urls: Array<string | null> = [];
  const seen = new Set<string>();
  for (const m of merchants.slice(0, 6)) {
    const raw = resolveMerchantBannerUri(m as MerchantSummary);
    for (const w of [railW, listW]) {
      const sized = sizedImageUrl(raw, w);
      if (!sized || seen.has(sized)) continue;
      seen.add(sized);
      urls.push(sized);
    }
  }
  prefetchImages(urls, { priority: "high", limit: 12 });
}
