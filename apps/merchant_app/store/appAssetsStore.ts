import { useEffect, useState } from "react";
import type { AppAssetItem } from "@/services/appAssets.service";
import { resolveImageUrl } from "@/services/outletApi";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";

let assets: Record<string, AppAssetItem> = {};
/** True only after a successful network fetch (not after a failed/timeout attempt). */
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function resolvedUrlForItem(item: AppAssetItem | undefined): string | null {
  if (!item) return null;
  const signed = item.url?.trim();
  if (!signed) return null;
  return resolveImageUrl(signed) ?? signed;
}

export function setAppAssets(next: Record<string, AppAssetItem>) {
  // Merge so a partial/slow refresh never blanks already-shown stage images.
  assets = { ...assets, ...next };
  loaded = true;
  emit();
}

export function isAppAssetsLoaded(): boolean {
  return loaded;
}

export function getAppAssetUrl(key: string): string | null {
  return resolvedUrlForItem(assets[key]);
}

/** True when super-admin has uploaded an image for this slot (R2 signed URL present). */
export function hasUploadedAppAsset(key: string): boolean {
  const item = assets[key];
  if (!item) return false;
  return Boolean(item.url?.trim());
}

export function getAppAssetProxyUrl(key: string): string | null {
  const proxy = assets[key]?.proxyUrl?.trim();
  return proxy ? resolveImageUrl(proxy) : null;
}

export function useAppAssetUrl(key: string): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const sub = () => tick((t) => t + 1);
    listeners.add(sub);
    return () => {
      listeners.delete(sub);
    };
  }, []);
  return getAppAssetUrl(key);
}

export function useHasUploadedAppAsset(key: string): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const sub = () => tick((t) => t + 1);
    listeners.add(sub);
    return () => {
      listeners.delete(sub);
    };
  }, []);
  return hasUploadedAppAsset(key);
}

export function useAppAssetSource(key: string) {
  const url = useAppAssetUrl(key);
  return url ? { uri: url } : null;
}

/** Refetch CMS images (startup can time out before new uploads appear). */
export async function reloadMerchantAppAssets(): Promise<boolean> {
  try {
    const res = await fetchMerchantAppAssets();
    setAppAssets(res.assets ?? {});
    return true;
  } catch {
    return false;
  }
}

/** Retry when the initial bootstrap fetch timed out or failed. */
export function needsAppAssetsFetch(): boolean {
  return !loaded;
}
