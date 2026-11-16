import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { STORAGE_KEYS } from "@/constants";
import { fetchCustomerAppAssets, type AppAssetItem } from "@/services/appAssets.service";
import {
  prefetchBrandBannerImageSync,
  prefetchCriticalHomeAssetImages,
  prefetchCriticalHomeAssetImagesSync,
} from "@/lib/homeCriticalAssets";
import { prefetchCriticalRideAssetImages } from "@/lib/rideCriticalAssets";
import { readSyncAppAssets } from "@/lib/appAssetsCache";
import { hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { enqueueImagePrefetch } from "@/lib/prefetchQueue";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useSplashExitedFlag } from "@/lib/splashLifecycle";

const RETRY_MS = [0, 2_000, 5_000, 10_000];
const FOREGROUND_RELOAD_MIN_MS = 8_000;

function prefetchRemainingAssetUrls(assets: Record<string, AppAssetItem>) {
  const uris: string[] = [];
  for (const item of Object.values(assets)) {
    for (const raw of [item.proxyUrl, item.url]) {
      const trimmed = raw?.trim();
      if (!trimmed) continue;
      const uri = toAbsoluteImageUrl(trimmed) ?? trimmed;
      if (!uri || uris.includes(uri)) continue;
      uris.push(uri);
    }
  }
  // Bounded queue — unbounded Image.prefetch starved on-screen home tiles.
  enqueueImagePrefetch(uris, 80);
}

function warmFromStoreAssets() {
  const seeded = useAppAssetsStore.getState().assets;
  if (Object.keys(seeded).length === 0) return;
  // Mark ready immediately so home isn't gated; decode critical art sync first.
  useAppAssetsStore.getState().setHomeImagesPrefetched(true);
  // Footer brand scooter first — must not sit behind service-grid prefetch.
  prefetchBrandBannerImageSync(seeded);
  prefetchCriticalHomeAssetImagesSync(seeded);
  void (async () => {
    await prefetchCriticalHomeAssetImages(seeded);
    void prefetchCriticalRideAssetImages(seeded);
    prefetchRemainingAssetUrls(seeded);
  })();
}

async function loadAppAssets(): Promise<boolean> {
  const res = await fetchCustomerAppAssets();
  const assets = res.assets ?? {};
  if (Object.keys(assets).length === 0) return false;
  useAppAssetsStore.getState().setAssets(assets);
  useAppAssetsStore.getState().setHomeImagesPrefetched(true);
  // Don't await full prefetch before returning — tiles already have URLs to paint.
  void prefetchCriticalHomeAssetImages(assets);
  void prefetchCriticalRideAssetImages(assets);
  prefetchRemainingAssetUrls(assets);
  return true;
}

/** Sync seed once at import — Home must not wait for effect/network for cached art. */
(function seedAppAssetsFromDiskSync() {
  try {
    if (Object.keys(useAppAssetsStore.getState().assets).length > 0) return;
    const cached = readSyncAppAssets();
    if (cached) {
      useAppAssetsStore.getState().setAssets(cached);
      useAppAssetsStore.getState().setHomeImagesPrefetched(true);
      // Start footer scooter decode before React mounts.
      prefetchBrandBannerImageSync(cached);
      prefetchCriticalHomeAssetImagesSync(cached);
    }
  } catch {
    /* ignore */
  }
})();

/** Load customer app static images from backend on startup (seed from disk first). */
export function AppAssetsPrefetch() {
  const setLoading = useAppAssetsStore((s) => s.setLoading);
  const markLoadFailed = useAppAssetsStore((s) => s.markLoadFailed);
  const splashExited = useSplashExitedFlag();
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkDoneRef = useRef(false);
  const lastForegroundReloadAt = useRef(0);

  // Disk seed only during splash — network waits so auth/navigation own the JS thread.
  useEffect(() => {
    let cancelled = false;
    if (Object.keys(useAppAssetsStore.getState().assets).length === 0) {
      const cached = readSyncAppAssets();
      if (cached) useAppAssetsStore.getState().setAssets(cached);
    }
    warmFromStoreAssets();
    void hydrateFastKvFromAsyncStorage([STORAGE_KEYS.APP_ASSETS_CACHE]).then(() => {
      if (cancelled) return;
      if (Object.keys(useAppAssetsStore.getState().assets).length === 0) {
        const cached = readSyncAppAssets();
        if (cached) useAppAssetsStore.getState().setAssets(cached);
      }
      warmFromStoreAssets();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!splashExited) return;
    let cancelled = false;
    let removeAppState: (() => void) | undefined;

    const runNetwork = async () => {
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
          if (!cancelled && !networkDoneRef.current) void runNetwork();
        }, delay);
      }
    };

    void runNetwork();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      if (!networkDoneRef.current) {
        attemptRef.current = 0;
        void runNetwork();
        return;
      }
      const now = Date.now();
      if (now - lastForegroundReloadAt.current < FOREGROUND_RELOAD_MIN_MS) return;
      lastForegroundReloadAt.current = now;
      void loadAppAssets();
    });
    removeAppState = () => sub.remove();

    return () => {
      cancelled = true;
      removeAppState?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [splashExited, setLoading, markLoadFailed]);

  return null;
}
