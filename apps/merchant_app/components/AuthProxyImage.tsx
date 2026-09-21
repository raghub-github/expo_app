/**
 * Menu / attachment images with durable disk + memory cache.
 *
 * Survives force-close. Cache key is the attachment object key, not the
 * rotating signed URL / LAN IP. Cached file paints immediately (no spinner);
 * a genuine new photo swaps in after download.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ImageProps,
  type ImageStyle,
  StyleSheet,
  View,
  type StyleProp,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  ensureMenuImageLocal,
  hydrateMenuImageDiskCache,
  isLocalUri,
  needsAuthDownload,
  peekMenuImageLocal,
  prefetchMenuImages,
  resolveRenderableUri,
  stableMenuImageCacheKey,
} from "@/lib/menuImageDiskCache";

void hydrateMenuImageDiskCache();

/** Instant display when the same attachment was already fetched. */
export function peekAuthImageCachedUri(uri: string | null | undefined): string | null {
  return peekMenuImageLocal(uri);
}

/** Warm auth-proxy / remote image cache before opening a sheet or modal. */
export function prefetchAuthImage(
  uri: string | null | undefined,
  token?: string | null
): Promise<string | null> {
  return ensureMenuImageLocal(uri, token);
}

/** Prefetch many catalog thumbnails (deduped by attachment key). */
export function prefetchAuthImages(
  uris: Array<string | null | undefined>,
  token?: string | null
): void {
  prefetchMenuImages(uris, token);
}

type Props = Omit<ImageProps, "source" | "resizeMode"> & {
  uri: string | null | undefined;
  token?: string | null;
  style?: StyleProp<ImageStyle>;
  showPlaceholder?: boolean;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
};

export function AuthProxyImage({
  uri,
  token,
  style,
  showPlaceholder = true,
  onError,
  resizeMode = "cover",
  ...imageProps
}: Props) {
  const resolved = resolveRenderableUri(uri);
  const memCached = peekMenuImageLocal(resolved);
  const [renderUri, setRenderUri] = useState<string | null>(memCached);
  const [failed, setFailed] = useState(false);
  const shownKeyRef = useRef<string | null>(
    memCached ? stableMenuImageCacheKey(resolved) : null
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextResolved = resolveRenderableUri(uri);
    if (!nextResolved) {
      setRenderUri(null);
      setFailed(false);
      shownKeyRef.current = null;
      return;
    }
    const cached = peekMenuImageLocal(nextResolved);
    if (cached) {
      setRenderUri(cached);
      setFailed(false);
      shownKeyRef.current = stableMenuImageCacheKey(nextResolved);
      return;
    }
    if (isLocalUri(nextResolved)) {
      setRenderUri(nextResolved);
      setFailed(false);
      shownKeyRef.current = nextResolved;
    }
    // Else keep the last painted file (no spinner) while the new key downloads.
  }, [uri]);

  useEffect(() => {
    if (!resolved) return;
    if (isLocalUri(resolved)) {
      setRenderUri(resolved);
      setFailed(false);
      shownKeyRef.current = resolved;
      return;
    }

    const nextKey = stableMenuImageCacheKey(resolved);
    if (nextKey && nextKey === shownKeyRef.current) {
      return;
    }

    let cancelled = false;
    void (async () => {
      await hydrateMenuImageDiskCache();
      if (cancelled) return;
      const cached = peekMenuImageLocal(resolved);
      if (cached) {
        setRenderUri(cached);
        setFailed(false);
        shownKeyRef.current = nextKey;
        return;
      }
      const local = await ensureMenuImageLocal(resolved, token);
      if (cancelled || !mountedRef.current) return;
      if (local) {
        setRenderUri(local);
        setFailed(false);
        shownKeyRef.current = nextKey;
        return;
      }
      if (needsAuthDownload(resolved)) {
        setRenderUri(resolved);
        setFailed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved, token]);

  const handleError = useCallback(() => {
    if (!failed && resolved && !isLocalUri(resolved)) {
      setFailed(true);
      void (async () => {
        const local = await ensureMenuImageLocal(resolved, token);
        if (!mountedRef.current) return;
        if (local) {
          setRenderUri(local);
          setFailed(false);
        }
      })();
      return;
    }
    onError?.({ nativeEvent: { error: "Image load failed" } } as Parameters<
      NonNullable<ImageProps["onError"]>
    >[0]);
  }, [failed, onError, resolved, token]);

  if (!resolved && !renderUri) {
    if (!showPlaceholder) return null;
    return (
      <View style={[styles.placeholder, style, { overflow: "hidden" }]}>
        <Ionicons name="image-outline" size={28} color={GatiMitraMerchant.textTertiary} />
      </View>
    );
  }

  if (failed && !renderUri) {
    if (!showPlaceholder) return null;
    return (
      <View style={[styles.placeholder, style, { overflow: "hidden" }]}>
        <Ionicons name="image-outline" size={28} color={GatiMitraMerchant.textTertiary} />
      </View>
    );
  }

  const displayUri = renderUri ?? resolved;
  if (!displayUri) {
    if (!showPlaceholder) return null;
    return (
      <View style={[styles.placeholder, style, { overflow: "hidden" }]}>
        <Ionicons name="image-outline" size={28} color={GatiMitraMerchant.textTertiary} />
      </View>
    );
  }

  const flat = StyleSheet.flatten(style) as ImageStyle | undefined;
  const radius = flat?.borderRadius;
  const contentFit =
    resizeMode === "contain"
      ? "contain"
      : resizeMode === "stretch"
        ? "fill"
        : resizeMode === "center"
          ? "none"
          : "cover";

  const recyclingKey = stableMenuImageCacheKey(resolved) ?? displayUri;

  return (
    <View style={[style, { overflow: "hidden", backgroundColor: "#E5E7EB" }]}>
      <Image
        {...(imageProps as object)}
        source={{ uri: displayUri }}
        style={[
          StyleSheet.absoluteFillObject,
          radius != null ? { borderRadius: radius } : null,
        ]}
        contentFit={contentFit}
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        allowDownscaling
        onError={handleError}
        transition={100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
});
