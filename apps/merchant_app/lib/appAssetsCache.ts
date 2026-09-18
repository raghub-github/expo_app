/**
 * Persist merchant CMS app-asset map so welcome / empty-state images can paint
 * before the network round-trip on cold start.
 */
import * as FileSystem from "expo-file-system/legacy";
import type { AppAssetItem } from "@/services/appAssets.service";

const CACHE_FILE = "merchant_app_assets_v1.json";

type AppAssetsCacheBlob = {
  assets: Record<string, AppAssetItem>;
  cachedAt: number;
};

let memory: Record<string, AppAssetItem> | null = null;
let hydratePromise: Promise<Record<string, AppAssetItem> | null> | null = null;

function cacheUri(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${CACHE_FILE}`;
}

function parseBlob(raw: string | null | undefined): Record<string, AppAssetItem> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppAssetsCacheBlob;
    if (!parsed?.assets || typeof parsed.assets !== "object") return null;
    return Object.keys(parsed.assets).length > 0 ? parsed.assets : null;
  } catch {
    return null;
  }
}

/** Sync read of in-memory seed (after hydrate / write). */
export function readSyncAppAssets(): Record<string, AppAssetItem> | null {
  return memory;
}

export async function hydrateAppAssetsCache(): Promise<Record<string, AppAssetItem> | null> {
  if (memory) return memory;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const uri = cacheUri();
    if (!uri) return null;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(uri);
      const assets = parseBlob(raw);
      if (assets) memory = assets;
      return assets;
    } catch {
      return null;
    } finally {
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

export function writeSyncAppAssets(assets: Record<string, AppAssetItem>): void {
  if (!assets || Object.keys(assets).length === 0) return;
  memory = assets;
  const uri = cacheUri();
  if (!uri) return;
  const blob: AppAssetsCacheBlob = { assets, cachedAt: Date.now() };
  void FileSystem.writeAsStringAsync(uri, JSON.stringify(blob)).catch(() => undefined);
}
