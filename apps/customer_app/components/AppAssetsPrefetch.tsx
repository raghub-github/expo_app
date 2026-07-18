import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Image } from "expo-image";
import { STORAGE_KEYS } from "@/constants";
import { fetchCustomerAppAssets } from "@/services/appAssets.service";
import { prefetchCriticalHomeAssetImages } from "@/lib/homeCriticalAssets";
import { prefetchCriticalRideAssetImages } from "@/lib/rideCriticalAssets";
import { readSyncAppAssets } from "@/lib/appAssetsCache";
import { hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
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

function warmFromStoreAssets() {
  const seeded = useAppAssetsStore.getState().assets;
  if (Object.keys(seeded).length === 0) return;
  void Promise.allSettled([
    prefetchCriticalHomeAssetImages(seeded),
    prefetchCriticalRideAssetImages(seeded),
  ]).then(() => {
    useAppAssetsStore.getState().setHomeImagesPrefetched(true);
  });
  prefetchRemainingAssetUrls(seeded);
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

/** Load customer app static images from backend on startup (seed from disk first). */
export function AppAssetsPrefetch() {
  const setLoading = useAppAssetsStore((s) => s.setLoading);
  const markLoadFailed = useAppAssetsStore((s) => s.markLoadFailed);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let removeAppState: (() => void) | undefined;

    const bootstrap = async () => {
      // Expo Go: hydrate AsyncStorage → memory so cached ride icons paint before network.
      await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.APP_ASSETS_CACHE]);
      if (cancelled) return;
      if (Object.keys(useAppAssetsStore.getState().assets).length === 0) {
        const cached = readSyncAppAssets();
        if (cached) useAppAssetsStore.getState().setAssets(cached);
      }
      if (!cancelled) warmFromStoreAssets();

      const run = async () => {
        if (networkDoneRef.current) return;
        setLoading(true);
        try {
          const ok = await loadAppAssets();
          if (cancelled) return;
          if (ok) {
            networkDoneRef.current = true;
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
            if (!cancelled && !networkDoneRef.current) void run();
          }, delay);
        }
      };

      void run();

      const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
        if (state === "active" && !networkDoneRef.current) {
          attemptRef.current = 0;
          void run();
        }
      });
      removeAppState = () => sub.remove();
    };

    void bootstrap();

    return () => {
      cancelled = true;
      removeAppState?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setLoading, markLoadFailed]);

  return null;
}
