import { useEffect } from "react";
import { Image, Platform } from "react-native";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import {
  getAppAssetUrl,
  isAppAssetsLoaded,
  needsAppAssetsFetch,
  setAppAssets,
} from "@/store/appAssetsStore";
import { MX } from "@/lib/appAssetKeys";

const RETRY_MS = 12_000;

const EMPTY_ORDER_ASSET_KEYS = [
  MX.orders.emptyNew,
  MX.orders.emptyActive,
  MX.orders.emptyPreparing,
  MX.orders.emptyReady,
  MX.orders.emptyPickedUp,
  MX.orders.emptyCompleted,
  MX.orders.emptyRto,
  MX.orders.emptyScheduled,
] as const;

function prefetchEmptyOrderImages(): void {
  for (const key of EMPTY_ORDER_ASSET_KEYS) {
    const url = getAppAssetUrl(key);
    if (!url) continue;
    if (Platform.OS === "web") {
      try {
        const img = new (globalThis as unknown as { Image: new () => HTMLImageElement }).Image();
        img.src = url;
      } catch {
        /* ignore */
      }
    } else {
      void Image.prefetch(url).catch(() => undefined);
    }
  }
}

/** Load merchant app static images from backend; retries until first success; prefetches empty-order art. */
export function AppAssetsPrefetch() {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled || isAppAssetsLoaded()) {
        if (isAppAssetsLoaded()) prefetchEmptyOrderImages();
        return;
      }
      try {
        const res = await fetchMerchantAppAssets();
        if (cancelled) return;
        setAppAssets(res.assets ?? {});
        prefetchEmptyOrderImages();
      } catch {
        /* keep needsAppAssetsFetch() true for retry */
      }
    };

    void load();
    const intervalId = setInterval(() => {
      if (!needsAppAssetsFetch()) {
        clearInterval(intervalId);
        prefetchEmptyOrderImages();
        return;
      }
      void load();
    }, RETRY_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
