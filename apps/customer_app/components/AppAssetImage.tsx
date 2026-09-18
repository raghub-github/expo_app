import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { pickAppAssetDisplayUri } from "@/lib/appAssetDisplayUri";

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
  /** Image fade duration. Home tiles pass 0 so icons paint without a delayed fade. */
  transition?: number;
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
  transition: transitionMs,
}: Props) {
  const rawUrl = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  const proxyUrl = useAppAssetsStore((s) => s.assets[assetKey]?.proxyUrl ?? null);
  const updatedAt = useAppAssetsStore((s) => s.assets[assetKey]?.updatedAt ?? null);
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [useBundled, setUseBundled] = useState(false);
  /** Keep last good URI so asset refresh / signed-URL rotate never blanks the tile. */
  const lastGoodUriRef = useRef<string | null>(null);
  const [, bump] = useState(0);

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
  const pick = pickAppAssetDisplayUri({
    preferredUri,
    lastGoodUri: lastGoodUriRef.current,
    fresh,
  });

  const commitGood = (uri: string | null | undefined) => {
    if (!uri) return;
    if (lastGoodUriRef.current === uri) {
      onLoad?.();
      return;
    }
    lastGoodUriRef.current = uri;
    bump((n) => n + 1);
    onLoad?.();
  };

  if (useBundled && fallbackSource) {
    return (
      <Image
        recyclingKey={`${assetKey}:bundled`}
        source={fallbackSource}
        style={style}
        contentFit={contentFit}
        accessibilityLabel={accessibilityLabel}
        onLoad={() => onLoad?.()}
      />
    );
  }

  // Always reserve layout: when no source yet, render a transparent placeholder Image
  // so the card image area never disappears / collapses.
  if (!pick.displayUri && !pick.pendingUri && !fallbackSource) {
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

  if (!pick.displayUri && !pick.pendingUri && fallbackSource) {
    return (
      <Image
        recyclingKey={`${assetKey}:fallback`}
        source={fallbackSource}
        style={style}
        contentFit={contentFit}
        accessibilityLabel={accessibilityLabel}
        onLoad={() => onLoad?.()}
      />
    );
  }

  const showBase = Boolean(pick.displayUri);
  const showPending =
    Boolean(pick.pendingUri) &&
    (pick.isRevalidating || pick.pendingUri !== pick.displayUri || !pick.displayUri);

  return (
    <View style={[styles.host, style]}>
      {showBase ? (
        <Image
          recyclingKey={fresh ? `${assetKey}:${updatedAt ?? ""}:base` : `${assetKey}:base`}
          source={{ uri: pick.displayUri! }}
          style={styles.fill}
          contentFit={contentFit}
          cachePolicy={fresh ? "none" : "memory-disk"}
          priority="high"
          transition={0}
          accessibilityLabel={accessibilityLabel}
          onLoad={() => commitGood(pick.displayUri)}
          onDisplay={() => commitGood(pick.displayUri)}
        />
      ) : null}
      {showPending && pick.pendingUri ? (
        <Image
          recyclingKey={
            fresh
              ? `${assetKey}:${updatedAt ?? ""}:${pick.pendingUri}`
              : `${assetKey}:pending`
          }
          source={{ uri: pick.pendingUri }}
          style={[styles.fill, pick.isRevalidating ? styles.pendingHidden : null]}
          contentFit={contentFit}
          cachePolicy={fresh ? "none" : "memory-disk"}
          priority="high"
          transition={transitionMs ?? 0}
          onLoad={() => commitGood(pick.pendingUri)}
          onDisplay={() => commitGood(pick.pendingUri)}
          onError={() => {
            if (!primaryFailed && altUri && pick.pendingUri === cacheUri) {
              setPrimaryFailed(true);
              return;
            }
            if (fallbackSource && !lastGoodUriRef.current) {
              setUseBundled(true);
              onLoad?.();
              return;
            }
            // Keep last-good visible — do not blank on failed refresh.
            // eslint-disable-next-line no-console
            console.warn(`[AppAssetImage] failed to load ${assetKey}`, pick.pendingUri);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  pendingHidden: {
    opacity: 0,
  },
});

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
