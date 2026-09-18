import { useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  getAppAssetUrl,
  isAppAssetsLoaded,
  needsAppAssetsFetch,
  ensureMerchantAppAssetsLoaded,
  useAppAssetUrl,
} from "@/store/appAssetsStore";
import { MX, MX_WELCOME_SLIDE_KEYS } from "@/lib/appAssetKeys";
import { prefetchWelcomeUris } from "@/lib/welcomeCriticalAssets";

const RETRY_MS = 12_000;

export const EMPTY_ORDER_ASSET_KEYS = [
  MX.orders.emptyNew,
  MX.orders.emptyActive,
  MX.orders.emptyPreparing,
  MX.orders.emptyReady,
  MX.orders.emptyPickedUp,
  MX.orders.emptyCompleted,
  MX.orders.emptyRto,
  MX.orders.emptyScheduled,
] as const;

/** Prefetch Offers promo art so Create offers banner is ready on first open. */
export const OFFERS_ASSET_KEYS = [
  MX.offers.promoBanner,
  MX.offers.emptyRunning,
] as const;

const PREFETCH_ASSET_KEYS = [
  ...MX_WELCOME_SLIDE_KEYS,
  ...EMPTY_ORDER_ASSET_KEYS,
  ...OFFERS_ASSET_KEYS,
] as const;

function prefetchKnownImages(): void {
  const welcomeUris: string[] = [];
  for (const key of MX_WELCOME_SLIDE_KEYS) {
    const url = getAppAssetUrl(key);
    if (url && !welcomeUris.includes(url)) welcomeUris.push(url);
  }
  prefetchWelcomeUris(welcomeUris);
  for (const key of [...EMPTY_ORDER_ASSET_KEYS, ...OFFERS_ASSET_KEYS]) {
    const url = getAppAssetUrl(key);
    if (!url) continue;
    if (Platform.OS === "web") {
      try {
        const img = new (globalThis as unknown as {
          Image: new () => HTMLImageElement;
        }).Image();
        img.decoding = "async";
        img.src = url;
      } catch {
        /* ignore */
      }
    } else {
      void ExpoImage.prefetch(url, { cachePolicy: "memory-disk" }).catch(() => undefined);
    }
  }
}

function HiddenPrefetchImage({ assetKey }: { assetKey: string }) {
  const url = useAppAssetUrl(assetKey);
  if (!url) return null;
  return (
    <ExpoImage
      source={{ uri: url }}
      style={styles.hidden}
      cachePolicy="memory-disk"
      recyclingKey={assetKey}
    />
  );
}

/** Load merchant CMS images once; prefetch welcome + order-stage empty illustrations. */
export function AppAssetsPrefetch() {
  const [, tick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      if (isAppAssetsLoaded()) {
        prefetchKnownImages();
        tick((t) => t + 1);
        if (!needsAppAssetsFetch()) return;
      }
      try {
        const ok = await ensureMerchantAppAssetsLoaded();
        if (cancelled || !ok) return;
        prefetchKnownImages();
        tick((t) => t + 1);
      } catch {
        /* keep needsAppAssetsFetch() true for retry */
      }
    };

    void load();
    const intervalId = setInterval(() => {
      if (!needsAppAssetsFetch()) {
        clearInterval(intervalId);
        prefetchKnownImages();
        tick((t) => t + 1);
        return;
      }
      void load();
    }, RETRY_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.host} accessibilityElementsHidden>
      {PREFETCH_ASSET_KEYS.map((key) => (
        <HiddenPrefetchImage key={key} assetKey={key} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
  },
  hidden: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
