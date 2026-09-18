import { useEffect, useState } from "react";
import type { AppAssetItem } from "@/services/appAssets.service";
import { resolveImageUrl } from "@/services/outletApi";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import {
  hydrateAppAssetsCache,
  readSyncAppAssets,
  writeSyncAppAssets,
} from "@/lib/appAssetsCache";
import { prefetchWelcomeSlideImages } from "@/lib/welcomeCriticalAssets";
import { warmWelcomeSlidesLocal } from "@/lib/welcomeImageDiskCache";
import { MX_WELCOME_SLIDE_KEYS } from "@/lib/appAssetKeys";

let assets: Record<string, AppAssetItem> = {};
/** True after disk seed or successful network fetch (URLs available for paint). */
let loaded = false;
/** True after at least one successful network fetch this process. */
let networkLoaded = false;
let fetchInflight: Promise<boolean> | null = null;
let hydrateInflight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function resolvedUrlForItem(item: AppAssetItem | undefined): string | null {
  if (!item) return null;
  // Prefer stable proxy so expo-image disk cache survives signed-URL rotation.
  const proxy = item.proxyUrl?.trim();
  if (proxy) return resolveImageUrl(proxy) ?? proxy;
  const signed = item.url?.trim();
  if (!signed) return null;
  return resolveImageUrl(signed) ?? signed;
}

function applyAssets(next: Record<string, AppAssetItem>, opts?: { persist?: boolean }) {
  assets = { ...assets, ...next };
  loaded = Object.keys(assets).length > 0;
  if (opts?.persist !== false && loaded) {
    writeSyncAppAssets(assets);
  }
  emit();
  prefetchWelcomeSlideImages(assets);
  warmWelcomeSlidesLocal(
    MX_WELCOME_SLIDE_KEYS.map((assetKey) => ({
      assetKey,
      url: (() => {
        const item = assets[assetKey];
        if (!item) return null;
        const signed = item.url?.trim();
        if (signed) return resolveImageUrl(signed) ?? signed;
        return resolvedUrlForItem(item);
      })(),
    }))
  );
}

export function setAppAssets(next: Record<string, AppAssetItem>) {
  // Merge so a partial/slow refresh never blanks already-shown stage images.
  applyAssets(next, { persist: true });
  networkLoaded = true;
}

export function isAppAssetsLoaded(): boolean {
  return loaded;
}

export function getAppAssetUrl(key: string): string | null {
  return resolvedUrlForItem(assets[key]);
}

/**
 * Prefer direct signed R2 URL for FileSystem.downloadAsync — proxy 302s are unreliable there.
 * Display still uses getAppAssetUrl (stable proxy) + expo-image.
 */
export function getAppAssetDownloadUrl(key: string): string | null {
  const item = assets[key];
  if (!item) return null;
  const signed = item.url?.trim();
  if (signed) return resolveImageUrl(signed) ?? signed;
  return resolvedUrlForItem(item);
}

/** True when super-admin has uploaded an image for this slot (R2 signed URL present). */
export function hasUploadedAppAsset(key: string): boolean {
  const item = assets[key];
  if (!item) return false;
  return Boolean(item.url?.trim() || item.proxyUrl?.trim());
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

/** Force refresh CMS images (e.g. after super-admin upload). */
export async function reloadMerchantAppAssets(): Promise<boolean> {
  try {
    const res = await fetchMerchantAppAssets();
    setAppAssets(res.assets ?? {});
    return true;
  } catch {
    return false;
  }
}

async function seedFromDisk(): Promise<boolean> {
  if (loaded && Object.keys(assets).length > 0) return true;
  if (hydrateInflight) return hydrateInflight;
  hydrateInflight = (async () => {
    try {
      const cached = (await hydrateAppAssetsCache()) ?? readSyncAppAssets();
      if (cached && Object.keys(cached).length > 0) {
        applyAssets(cached, { persist: false });
        return true;
      }
      return false;
    } finally {
      hydrateInflight = null;
    }
  })();
  return hydrateInflight;
}

/**
 * Disk seed first (instant welcome URLs), then network refresh.
 * Single in-flight network fetch — _layout + AppAssetsPrefetch must not stampede.
 */
export async function ensureMerchantAppAssetsLoaded(): Promise<boolean> {
  await seedFromDisk();
  if (networkLoaded) return true;
  if (fetchInflight) return fetchInflight;
  fetchInflight = (async () => {
    try {
      const res = await fetchMerchantAppAssets();
      setAppAssets(res.assets ?? {});
      return true;
    } catch {
      return loaded;
    } finally {
      fetchInflight = null;
    }
  })();
  return fetchInflight;
}

/** Retry when the initial bootstrap fetch timed out or failed. */
export function needsAppAssetsFetch(): boolean {
  return !networkLoaded;
}
