/**
 * Persist CMS app-asset URL map for instant ride/home paint (food-home cache pattern).
 */

import { STORAGE_KEYS } from "@/constants";
import type { AppAssetItem } from "@/services/appAssets.service";
import { fastGetString, fastSetString } from "@/lib/fastKv";

type AppAssetsCacheBlob = {
  assets: Record<string, AppAssetItem>;
  cachedAt: number;
};

function parseBlob(raw: string | null | undefined): AppAssetsCacheBlob | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppAssetsCacheBlob;
    if (!parsed?.assets || typeof parsed.assets !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Sync read for store hydrate / first paint. */
export function readSyncAppAssets(): Record<string, AppAssetItem> | null {
  const blob = parseBlob(fastGetString(STORAGE_KEYS.APP_ASSETS_CACHE));
  if (!blob) return null;
  const keys = Object.keys(blob.assets);
  return keys.length > 0 ? blob.assets : null;
}

export function writeSyncAppAssets(assets: Record<string, AppAssetItem>): void {
  if (!assets || Object.keys(assets).length === 0) return;
  const blob: AppAssetsCacheBlob = { assets, cachedAt: Date.now() };
  try {
    fastSetString(STORAGE_KEYS.APP_ASSETS_CACHE, JSON.stringify(blob));
  } catch {
    // ignore quota / native errors
  }
}
