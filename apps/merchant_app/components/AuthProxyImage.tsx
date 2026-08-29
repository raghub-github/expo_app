/**
 * Menu / attachment images with durable disk + memory cache.
 * Survives force-close: local files under cacheDirectory are reused on next launch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type ImageProps,
  type ImageStyle,
  StyleSheet,
  View,
  type StyleProp,
} from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { resolveUrlForDevice } from "@/config/env";
import { resolveImageUrl } from "@/services/outletApi";
import { GatiMitraMerchant } from "@/constants/theme";

const URI_CACHE = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<string | null>>();
const DISK_MISS = new Set<string>();
const MAX_URI_CACHE = 200;
const MAX_DISK_MISS = 400;

function rememberUri(resolved: string, local: string): void {
  if (URI_CACHE.size >= MAX_URI_CACHE) {
    const first = URI_CACHE.keys().next().value;
    if (first != null) URI_CACHE.delete(first);
  }
  URI_CACHE.set(resolved, local);
}

function rememberDiskMiss(resolved: string): void {
  if (DISK_MISS.size >= MAX_DISK_MISS) {
    const first = DISK_MISS.values().next().value;
    if (first != null) DISK_MISS.delete(first);
  }
  DISK_MISS.add(resolved);
}

function resolveRenderableUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return resolveImageUrl(uri) ?? resolveUrlForDevice(uri);
}

function cacheFilePath(resolved: string): string | null {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return null;
  let hash = 0;
  for (let i = 0; i < resolved.length; i += 1) {
    hash = (hash * 31 + resolved.charCodeAt(i)) | 0;
  }
  return `${cacheDir}menu-img-${Math.abs(hash)}.img`;
}

function isLocalUri(uri: string): boolean {
  const u = uri.toLowerCase();
  return u.startsWith("file://") || u.startsWith("content://") || u.startsWith("data:");
}

/** Instant display when the same URL was already fetched on the catalog card. */
export function peekAuthImageCachedUri(uri: string | null | undefined): string | null {
  const resolved = resolveRenderableUri(uri);
  if (!resolved) return null;
  return URI_CACHE.get(resolved) ?? null;
}

function needsAuthDownload(uri: string): boolean {
  const u = uri.toLowerCase();
  if (isLocalUri(u)) return false;
  return (
    u.includes("/attachments/proxy?") ||
    u.includes("/v1/attachments/") ||
    u.includes("/api/attachments/")
  );
}

async function readDiskCache(resolved: string): Promise<string | null> {
  const mem = URI_CACHE.get(resolved);
  if (mem) return mem;
  if (DISK_MISS.has(resolved)) return null;

  const target = cacheFilePath(resolved);
  if (!target) return null;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      rememberUri(resolved, target);
      return target;
    }
  } catch {
    /* miss */
  }
  rememberDiskMiss(resolved);
  return null;
}

async function fetchAuthImageLocalUri(uri: string, token?: string | null): Promise<string | null> {
  if (!uri) return null;
  if (isLocalUri(uri)) {
    rememberUri(uri, uri);
    return uri;
  }

  const fromDisk = await readDiskCache(uri);
  if (fromDisk) return fromDisk;

  const target = cacheFilePath(uri);
  if (!target) return null;

  try {
    const result = await FileSystem.downloadAsync(uri, target, {
      headers: token && needsAuthDownload(uri) ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status >= 200 && result.status < 300 && result.uri) {
      DISK_MISS.delete(uri);
      rememberUri(uri, result.uri);
      return result.uri;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Warm auth-proxy / remote image cache before opening a sheet or modal. */
export function prefetchAuthImage(
  uri: string | null | undefined,
  token?: string | null,
): Promise<string | null> {
  const resolved = resolveRenderableUri(uri);
  if (!resolved) return Promise.resolve(null);
  if (URI_CACHE.has(resolved)) return Promise.resolve(URI_CACHE.get(resolved) ?? null);
  const pending = IN_FLIGHT.get(resolved);
  if (pending) return pending;
  const task = fetchAuthImageLocalUri(resolved, token).finally(() => {
    IN_FLIGHT.delete(resolved);
  });
  IN_FLIGHT.set(resolved, task);
  return task;
}

/** Prefetch many catalog thumbnails (deduped). */
export function prefetchAuthImages(
  uris: Array<string | null | undefined>,
  token?: string | null,
): void {
  for (const uri of uris) {
    if (!uri) continue;
    void prefetchAuthImage(uri, token);
  }
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
  const memCached = resolved ? URI_CACHE.get(resolved) ?? null : null;
  const [renderUri, setRenderUri] = useState<string | null>(memCached);
  const [loading, setLoading] = useState(() => Boolean(resolved && !memCached));
  const [failed, setFailed] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextResolved = resolveRenderableUri(uri);
    const nextMem = nextResolved ? URI_CACHE.get(nextResolved) ?? null : null;
    setFailed(false);
    if (!nextResolved) {
      setRenderUri(null);
      setLoading(false);
      return;
    }
    if (nextMem) {
      setRenderUri(nextMem);
      setLoading(false);
      return;
    }
    // Don't paint auth-proxy URLs directly — they need a Bearer download first.
    if (needsAuthDownload(nextResolved)) {
      setRenderUri(null);
      setLoading(true);
    } else if (isLocalUri(nextResolved)) {
      setRenderUri(nextResolved);
      setLoading(false);
    } else {
      // Public CDN: show via expo-image while we also hydrate disk cache.
      setRenderUri(nextResolved);
      setLoading(false);
    }
  }, [uri]);

  useEffect(() => {
    if (!resolved) return;
    if (isLocalUri(resolved)) {
      rememberUri(resolved, resolved);
      setRenderUri(resolved);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const local = await prefetchAuthImage(resolved, token);
      if (cancelled) return;
      if (local) {
        setRenderUri(local);
        setFailed(false);
      } else if (needsAuthDownload(resolved)) {
        // Proxy 302s to a signed R2 URL. expo-image follows that; FileSystem sometimes cannot.
        setRenderUri(resolved);
        setFailed(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved, token]);

  const handleError = useCallback(() => {
    if (!failed && resolved && !isLocalUri(resolved)) {
      setFailed(true);
      void (async () => {
        DISK_MISS.delete(resolved);
        URI_CACHE.delete(resolved);
        const local = await fetchAuthImageLocalUri(resolved, token);
        if (!mountedRef.current) return;
        if (local) {
          setRenderUri(local);
          setFailed(false);
          setLoading(false);
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

  if (loading && !renderUri) {
    return (
      <View style={[styles.placeholder, style, { overflow: "hidden" }]}>
        <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
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

  return (
    <View style={[style, { overflow: "hidden" }]}>
      <Image
        {...(imageProps as object)}
        source={{ uri: renderUri ?? resolved! }}
        style={[
          StyleSheet.absoluteFillObject,
          radius != null ? { borderRadius: radius } : null,
        ]}
        contentFit={contentFit}
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={resolved ?? renderUri ?? undefined}
        allowDownscaling
        onError={handleError}
        transition={0}
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
