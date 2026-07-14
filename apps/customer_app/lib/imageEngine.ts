/**
 * Central image loading defaults — expo-image memory-disk cache + prefetch.
 */

import { Image } from "expo-image";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export const IMAGE_CACHE_POLICY = "memory-disk" as const;

const prefetched = new Set<string>();

export function resolveImageUri(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return toAbsoluteImageUrl(url.trim()) ?? url.trim();
}

/** Prefetch URIs into disk+memory. Deduped per process. */
export function prefetchImages(
  urls: Array<string | null | undefined>,
  opts?: { priority?: "low" | "normal" | "high"; limit?: number }
): void {
  const limit = opts?.limit ?? 24;
  const resolved: string[] = [];
  for (const url of urls) {
    const uri = resolveImageUri(url);
    if (!uri || prefetched.has(uri)) continue;
    prefetched.add(uri);
    resolved.push(uri);
    if (resolved.length >= limit) break;
  }
  if (resolved.length === 0) return;

  const run = () => {
    void Promise.allSettled(
      resolved.map((uri) => Image.prefetch(uri, { cachePolicy: IMAGE_CACHE_POLICY }))
    );
  };

  if (opts?.priority === "high") {
    run();
    return;
  }
  // Defer low/normal so first paint stays free.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      setTimeout(run, opts?.priority === "low" ? 120 : 0);
    });
  } else {
    setTimeout(run, opts?.priority === "low" ? 120 : 0);
  }
}

export function prefetchMerchantCardImages(merchants: Array<{
  displayImage?: string | null;
  banner_url?: string | null;
  galleryImages?: string[];
}>): void {
  const urls: Array<string | null | undefined> = [];
  for (const m of merchants.slice(0, 12)) {
    urls.push(m.displayImage, m.banner_url, m.galleryImages?.[0]);
  }
  prefetchImages(urls, { priority: "high", limit: 16 });
}
