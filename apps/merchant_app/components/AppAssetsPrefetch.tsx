import { useEffect } from "react";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import { isAppAssetsLoaded, needsAppAssetsFetch, setAppAssets } from "@/store/appAssetsStore";

const RETRY_MS = 12_000;

/** Load merchant app static images from backend; retries until first success. */
export function AppAssetsPrefetch() {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled || isAppAssetsLoaded()) return;
      try {
        const res = await fetchMerchantAppAssets();
        if (cancelled) return;
        setAppAssets(res.assets ?? {});
      } catch {
        /* keep needsAppAssetsFetch() true for retry */
      }
    };

    void load();
    const intervalId = setInterval(() => {
      if (!needsAppAssetsFetch()) {
        clearInterval(intervalId);
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
