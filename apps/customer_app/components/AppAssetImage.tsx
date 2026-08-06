import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "expo-image";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  accessibilityLabel?: string;
  /** Shown when CMS URL is not ready yet (e.g. bundled ride service PNG). */
  fallbackSource?: ImageSourcePropType | null;
};

/** Renders a CMS-managed image from backend (R2 signed / proxy), with optional bundled fallback. */
export function AppAssetImage({
  assetKey,
  style,
  contentFit = "contain",
  accessibilityLabel,
  fallbackSource = null,
}: Props) {
  const rawUrl = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  const proxyUrl = useAppAssetsStore((s) => s.assets[assetKey]?.proxyUrl ?? null);
  const [primaryFailed, setPrimaryFailed] = useState(false);
  /** Keep last good URI so asset refresh / signed-URL rotate never blanks the tile. */
  const lastGoodUriRef = useRef<string | null>(null);

  const primaryUri = useMemo(() => {
    if (!rawUrl?.trim()) return null;
    return toAbsoluteImageUrl(rawUrl) ?? rawUrl.trim();
  }, [rawUrl]);

  const fallbackUri = useMemo(() => {
    if (!proxyUrl?.trim()) return null;
    return toAbsoluteImageUrl(proxyUrl);
  }, [proxyUrl]);

  useEffect(() => {
    setPrimaryFailed(false);
  }, [primaryUri]);

  const preferredUri =
    primaryFailed && fallbackUri && fallbackUri !== primaryUri
      ? fallbackUri
      : primaryUri;

  if (preferredUri) {
    lastGoodUriRef.current = preferredUri;
  }

  const uri = preferredUri ?? lastGoodUriRef.current;

  const source: ImageSourcePropType | null = uri
    ? { uri }
    : fallbackSource;

  if (!source) return null;

  return (
    <Image
      // Stable key — remounting on every signed-URL change blanked all home tiles.
      recyclingKey={assetKey}
      source={source}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      priority="high"
      transition={0}
      accessibilityLabel={accessibilityLabel}
      onError={() => {
        if (!primaryFailed && fallbackUri && fallbackUri !== primaryUri) {
          setPrimaryFailed(true);
          return;
        }
        // eslint-disable-next-line no-console
        console.warn(`[AppAssetImage] failed to load ${assetKey}`, uri ?? "(bundled fallback)");
      }}
    />
  );
}

export function useAppAssetUrl(assetKey: string): string | null {
  const url = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  return url;
}

export function useAppAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = useAppAssetUrl(assetKey);
  return useMemo(() => (url ? { uri: url } : null), [url]);
}

/** Sync helper for non-hook contexts (after prefetch). */
export function appAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = getAppAssetUrl(assetKey);
  return url ? { uri: url } : null;
}

/** Resolve proxy path or absolute URL for map HTML / web views. */
export function appAssetAbsoluteUrl(assetKey: string): string | null {
  const fromStore = getAppAssetUrl(assetKey);
  if (fromStore) return fromStore;
  const proxy = getAppAssetProxyUrl(assetKey);
  return proxy ? toAbsoluteImageUrl(proxy) : null;
}
