import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Image } from "expo-image";
import { fetchCustomerAppAssets } from "@/services/appAssets.service";
import { prefetchCriticalHomeAssetImages } from "@/lib/homeCriticalAssets";
import { prefetchCriticalRideAssetImages } from "@/lib/rideCriticalAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";

const prefetched = new Set<string>();
const RETRY_MS = [0, 2_000, 5_000, 10_000];

function prefetchRemainingAssetUrls(assets: Record<string, { url: string | null }>) {
  for (const item of Object.values(assets)) {
    const uri = item.url?.trim();
    if (!uri || prefetched.has(uri)) continue;
    prefetched.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}

async function loadAppAssets(): Promise<boolean> {
  const res = await fetchCustomerAppAssets();
  const assets = res.assets ?? {};
  if (Object.keys(assets).length === 0) return false;
  useAppAssetsStore.getState().setAssets(assets);
  await Promise.allSettled([
    prefetchCriticalHomeAssetImages(assets),
    prefetchCriticalRideAssetImages(assets),
  ]);
  useAppAssetsStore.getState().setHomeImagesPrefetched(true);
  prefetchRemainingAssetUrls(assets);
  return true;
}

/** Load customer app static images from backend on startup (retries on failure). */
export function AppAssetsPrefetch() {
  const setLoading = useAppAssetsStore((s) => s.setLoading);
  const markLoadFailed = useAppAssetsStore((s) => s.markLoadFailed);
  const loaded = useAppAssetsStore((s) => s.loaded);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loaded) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const ok = await loadAppAssets();
        if (cancelled) return;
        if (ok) {
          attemptRef.current = 0;
          return;
        }
        throw new Error("empty app assets");
      } catch {
        if (cancelled) return;
        markLoadFailed();
        const delay = RETRY_MS[Math.min(attemptRef.current, RETRY_MS.length - 1)] ?? 10_000;
        attemptRef.current += 1;
        timerRef.current = setTimeout(() => {
          if (!cancelled && !useAppAssetsStore.getState().loaded) void run();
        }, delay);
      }
    };

    void run();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active" && !useAppAssetsStore.getState().loaded) {
        attemptRef.current = 0;
        void run();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loaded, setLoading, markLoadFailed]);

  return null;
}
