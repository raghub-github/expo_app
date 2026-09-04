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
  /**
   * Skip stale disk cache / last-good URI so Super Admin Change/Remove
   * is visible as soon as the asset payload refreshes.
   */
  fresh?: boolean;
  onLoad?: () => void;
};

/** Renders a CMS-managed image from backend (R2 signed / proxy), with optional bundled fallback. */
export function AppAssetImage({
  assetKey,
  style,
  contentFit = "contain",
  accessibilityLabel,
  fallbackSource = null,
  fresh = false,
  onLoad,
}: Props) {
  const rawUrl = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  const proxyUrl = useAppAssetsStore((s) => s.assets[assetKey]?.proxyUrl ?? null);
  const updatedAt = useAppAssetsStore((s) => s.assets[assetKey]?.updatedAt ?? null);
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [useBundled, setUseBundled] = useState(false);
  /** Keep last good URI so asset refresh / signed-URL rotate never blanks the tile. */
  const lastGoodUriRef = useRef<string | null>(null);

  const signedUri = useMemo(() => {
    if (!rawUrl?.trim()) return null;
    return toAbsoluteImageUrl(rawUrl) ?? rawUrl.trim();
  }, [rawUrl]);

  const proxyUri = useMemo(() => {
    if (!proxyUrl?.trim()) return null;
    return toAbsoluteImageUrl(proxyUrl);
  }, [proxyUrl]);

  // Stable proxy URL hits expo-image disk cache; signed URLs rotate and miss.
  const cacheUri = fresh ? (signedUri ?? proxyUri) : (proxyUri ?? signedUri);
  const altUri =
    signedUri && signedUri !== cacheUri
      ? signedUri
      : proxyUri && proxyUri !== cacheUri
        ? proxyUri
        : null;

  useEffect(() => {
    // Stale-while-revalidate: keep showing the previous URI while a new URL loads.
    // Only clear failure flags so we can retry the new source without blanking.
    setPrimaryFailed(false);
    setUseBundled(false);
  }, [cacheUri]);

  const preferredUri = primaryFailed && altUri ? altUri : cacheUri;

  // Prefer live URI; fall back to last-good so image area never collapses.
  // Do not overwrite lastGood until onLoad — failed refresh must keep the old bitmap.
  const uri = preferredUri ?? (!fresh ? lastGoodUriRef.current : null);

  const source: ImageSourcePropType | null = useBundled
    ? fallbackSource
    : uri
      ? { uri }
      : fallbackSource;

  // Always reserve layout: when no source yet, render a transparent placeholder Image
  // so the card image area never disappears / collapses.
  if (!source) {
    return (
      <Image
        recyclingKey={assetKey}
        source={{ uri: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }}
        style={[{ opacity: 0 }, style]}
        contentFit={contentFit}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <Image
      // Stable key — remounting on every signed-URL change blanked all home tiles.
      // When fresh=true (admin preview), include updatedAt so Change/Remove is visible.
      recyclingKey={
        fresh ? `${assetKey}:${updatedAt ?? ""}:${proxyUrl ?? ""}` : assetKey
      }
      source={source}
      placeholder={
        !useBundled && lastGoodUriRef.current && lastGoodUriRef.current !== uri
          ? { uri: lastGoodUriRef.current }
          : !useBundled && uri && fallbackSource
            ? fallbackSource
            : undefined
      }
      placeholderContentFit={contentFit}
      style={style}
      contentFit={contentFit}
      cachePolicy={fresh ? "none" : "memory-disk"}
      priority="high"
      transition={fresh ? 0 : 120}
      accessibilityLabel={accessibilityLabel}
      onLoad={() => {
        if (uri) lastGoodUriRef.current = uri;
        onLoad?.();
      }}
      onDisplay={() => {
        if (uri) lastGoodUriRef.current = uri;
        onLoad?.();
      }}
      onError={() => {
        if (!useBundled && !primaryFailed && altUri) {
          setPrimaryFailed(true);
          return;
        }
        if (fallbackSource) {
          setUseBundled(true);
          onLoad?.();
          return;
        }
        // Keep last-good URI visible — do not blank on failed refresh.
        if (!fresh && lastGoodUriRef.current && preferredUri && lastGoodUriRef.current !== preferredUri) {
          // Force render path back to last-good by marking primary failed with no alt.
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
