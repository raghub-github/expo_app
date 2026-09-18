/**
 * Welcome carousel images — prefetch into expo-image disk cache so login paints instantly.
 */
import { Platform } from "react-native";
import { Image } from "expo-image";
import type { AppAssetItem } from "@/services/appAssets.service";
import { MX_WELCOME_SLIDE_KEYS } from "@/lib/appAssetKeys";
import { resolveImageUrl } from "@/services/outletApi";

function collectUrisForAsset(item: AppAssetItem | undefined, into: string[]): void {
  if (!item) return;
  // Stable proxy URL hits expo-image disk cache; signed R2 URLs rotate and miss.
  for (const raw of [item.proxyUrl, item.url]) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const uri = resolveImageUrl(trimmed) ?? trimmed;
    if (!uri || into.includes(uri)) continue;
    into.push(uri);
  }
}

export function collectWelcomeSlideUris(assets: Record<string, AppAssetItem>): string[] {
  const uris: string[] = [];
  for (const key of MX_WELCOME_SLIDE_KEYS) {
    collectUrisForAsset(assets[key], uris);
  }
  return uris;
}

export function prefetchWelcomeUris(uris: string[]): void {
  if (uris.length === 0) return;
  if (Platform.OS === "web") {
    for (const url of uris) {
      try {
        const img = new (globalThis as unknown as {
          Image: new () => HTMLImageElement;
        }).Image();
        img.decoding = "async";
        img.src = url;
      } catch {
        /* ignore */
      }
    }
    return;
  }
  for (const uri of uris) {
    void Image.prefetch(uri, { cachePolicy: "memory-disk" }).catch(() => undefined);
  }
}

export function prefetchWelcomeSlideImages(assets: Record<string, AppAssetItem>): void {
  prefetchWelcomeUris(collectWelcomeSlideUris(assets));
}
