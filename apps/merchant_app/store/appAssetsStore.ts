import { useEffect, useState } from "react";
import type { AppAssetItem } from "@/services/appAssets.service";

let assets: Record<string, AppAssetItem> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setAppAssets(next: Record<string, AppAssetItem>) {
  assets = next;
  loaded = true;
  emit();
}

export function isAppAssetsLoaded(): boolean {
  return loaded;
}

export function getAppAssetUrl(key: string): string | null {
  return assets[key]?.url?.trim() || null;
}

export function getAppAssetProxyUrl(key: string): string | null {
  return assets[key]?.proxyUrl?.trim() || null;
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

export function useAppAssetSource(key: string) {
  const url = useAppAssetUrl(key);
  return url ? { uri: url } : null;
}
