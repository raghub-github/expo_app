import { useEffect } from "react";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import { isAppAssetsLoaded, setAppAssets } from "@/store/appAssetsStore";

/** Load merchant app static images from backend on startup. */
export function AppAssetsPrefetch() {
  useEffect(() => {
    if (isAppAssetsLoaded()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMerchantAppAssets();
        if (cancelled) return;
        setAppAssets(res.assets ?? {});
      } catch {
        if (!cancelled) setAppAssets({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
