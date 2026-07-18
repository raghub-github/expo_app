import { create } from "zustand";
import type { AppAssetItem } from "@/services/appAssets.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { readSyncAppAssets, writeSyncAppAssets } from "@/lib/appAssetsCache";

type AppAssetsState = {
  assets: Record<string, AppAssetItem>;
  loaded: boolean;
  loading: boolean;
  /** True after home-critical CMS images are on disk cache. */
  homeImagesPrefetched: boolean;
  setAssets: (assets: Record<string, AppAssetItem>) => void;
  setLoading: (loading: boolean) => void;
  setHomeImagesPrefetched: (done: boolean) => void;
  markLoadFailed: () => void;
};

function normalizeAssets(assets: Record<string, AppAssetItem>): Record<string, AppAssetItem> {
  const out: Record<string, AppAssetItem> = {};
  for (const [key, item] of Object.entries(assets)) {
    const url = toAbsoluteImageUrl(item.url) ?? toAbsoluteImageUrl(item.proxyUrl);
    out[key] = { ...item, url };
  }
  return out;
}

const seeded = readSyncAppAssets();
const seededNormalized = seeded ? normalizeAssets(seeded) : {};
const hasSeed = Object.keys(seededNormalized).length > 0;

export const useAppAssetsStore = create<AppAssetsState>((set) => ({
  assets: seededNormalized,
  loaded: hasSeed,
  loading: false,
  homeImagesPrefetched: false,
  setAssets: (assets) => {
    const normalized = normalizeAssets(assets);
    writeSyncAppAssets(normalized);
    set({ assets: normalized, loaded: true, loading: false });
  },
  setLoading: (loading) => set({ loading }),
  setHomeImagesPrefetched: (done) => set({ homeImagesPrefetched: done }),
  markLoadFailed: () => set({ loading: false, homeImagesPrefetched: true }),
}));

export function getAppAssetUrl(key: string): string | null {
  const item = useAppAssetsStore.getState().assets[key];
  return item?.url?.trim() || null;
}

export function getAppAssetProxyUrl(key: string): string | null {
  const item = useAppAssetsStore.getState().assets[key];
  const proxy = item?.proxyUrl?.trim() || null;
  return proxy ? toAbsoluteImageUrl(proxy) : null;
}

/** Refetch CMS static images (e.g. pull-to-refresh when backend was down at startup). */
export async function reloadCustomerAppAssets(): Promise<boolean> {
  try {
    const { fetchCustomerAppAssets } = await import("@/services/appAssets.service");
    const res = await fetchCustomerAppAssets();
    const assets = res.assets ?? {};
    if (Object.keys(assets).length === 0) return false;
    useAppAssetsStore.getState().setAssets(assets);
    return true;
  } catch {
    return false;
  }
}
