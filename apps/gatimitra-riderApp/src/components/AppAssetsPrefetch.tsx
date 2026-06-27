import { useEffect } from "react";
import { fetchRiderAppAssets } from "@/src/services/appAssets.service";
import { useAppAssetsStore } from "@/src/stores/appAssetsStore";

/** Load rider app static images from backend on startup. */
export function AppAssetsPrefetch() {
  const setAssets = useAppAssetsStore((s) => s.setAssets);
  const setLoading = useAppAssetsStore((s) => s.setLoading);
  const loaded = useAppAssetsStore((s) => s.loaded);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetchRiderAppAssets();
        if (cancelled) return;
        setAssets(res.assets ?? {});
      } catch {
        if (!cancelled) setAssets({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, setAssets, setLoading]);

  return null;
}
