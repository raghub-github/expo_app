import { create } from "zustand";
import type { AppAssetItem } from "@/src/services/appAssets.service";

type AppAssetsState = {
  assets: Record<string, AppAssetItem>;
  /** Disk file:// URIs for CMS images (login hero). Survives offline. */
  localFiles: Record<string, string>;
  loaded: boolean;
  loading: boolean;
  setAssets: (assets: Record<string, AppAssetItem>) => void;
  setLocalFile: (key: string, uri: string) => void;
  setLoading: (loading: boolean) => void;
};

export const useAppAssetsStore = create<AppAssetsState>((set) => ({
  assets: {},
  localFiles: {},
  loaded: false,
  loading: false,
  setAssets: (assets) => set({ assets, loaded: true, loading: false }),
  setLocalFile: (key, uri) =>
    set((s) => ({ localFiles: { ...s.localFiles, [key]: uri } })),
  setLoading: (loading) => set({ loading }),
}));

export function getAppAssetUrl(key: string): string | null {
  const item = useAppAssetsStore.getState().assets[key];
  return item?.url?.trim() || null;
}

export function getAppAssetProxyUrl(key: string): string | null {
  const item = useAppAssetsStore.getState().assets[key];
  return item?.proxyUrl?.trim() || null;
}

export function getAppAssetLocalUri(key: string): string | null {
  return useAppAssetsStore.getState().localFiles[key]?.trim() || null;
}
