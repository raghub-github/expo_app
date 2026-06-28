import { create } from "zustand";
import type { AppAssetItem } from "@/src/services/appAssets.service";

type AppAssetsState = {
  assets: Record<string, AppAssetItem>;
  loaded: boolean;
  loading: boolean;
  setAssets: (assets: Record<string, AppAssetItem>) => void;
  setLoading: (loading: boolean) => void;
};

export const useAppAssetsStore = create<AppAssetsState>((set) => ({
  assets: {},
  loaded: false,
  loading: false,
  setAssets: (assets) => set({ assets, loaded: true, loading: false }),
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
