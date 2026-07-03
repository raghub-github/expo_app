import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageProps,
  type ImageStyle,
  StyleSheet,
  View,
  type StyleProp,
} from "react-native";
// Legacy sub-path — `cacheDirectory` isn't on the top-level `expo-file-system`
// export in v19+, and the mxap code was written against the old surface.
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { resolveUrlForDevice } from "@/config/env";
import { resolveImageUrl } from "@/services/outletApi";
import { GatiMitraMerchant } from "@/constants/theme";

const URI_CACHE = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<string | null>>();

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

/** Instant display when the same URL was already fetched on the catalog card. */
export function peekAuthImageCachedUri(uri: string | null | undefined): string | null {
  const resolved = resolveRenderableUri(uri);
  if (!resolved) return null;
  return URI_CACHE.get(resolved) ?? null;
}

/** Warm auth-proxy image cache before opening a sheet or modal. */
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

function needsAuthDownload(uri: string): boolean {
  const u = uri.toLowerCase();
  if (u.startsWith("file://") || u.startsWith("content://") || u.startsWith("data:")) return false;
  return u.includes("/attachments/proxy?") || u.includes("/v1/attachments/") || u.includes("/api/attachments/");
}

async function fetchAuthImageLocalUri(uri: string, token?: string | null): Promise<string | null> {
  if (!uri) return null;
  const cached = URI_CACHE.get(uri);
  if (cached) return cached;

  const target = cacheFilePath(uri);
  if (target) {
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists) {
        URI_CACHE.set(uri, target);
        return target;
      }
    } catch {
      // continue to download
    }
  }

  try {
    if (!target) return null;
    const result = await FileSystem.downloadAsync(uri, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status >= 200 && result.status < 300 && result.uri) {
      URI_CACHE.set(uri, result.uri);
      return result.uri;
    }
  } catch {
    // fall through
  }
  return null;
}

type Props = Omit<ImageProps, "source"> & {
  uri: string | null | undefined;
  token?: string | null;
  style?: StyleProp<ImageStyle>;
  showPlaceholder?: boolean;
};

export function AuthProxyImage({
  uri,
  token,
  style,
  showPlaceholder = true,
  onError,
  ...imageProps
}: Props) {
  const resolved = resolveRenderableUri(uri);
  const cachedLocal = resolved ? URI_CACHE.get(resolved) ?? null : null;
  const [renderUri, setRenderUri] = useState<string | null>(cachedLocal ?? resolved);
  const [loading, setLoading] = useState(
    () => Boolean(resolved && needsAuthDownload(resolved) && !cachedLocal)
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const nextResolved = resolveRenderableUri(uri);
    const nextCached = nextResolved ? URI_CACHE.get(nextResolved) ?? null : null;
    setRenderUri(nextCached ?? nextResolved);
    setFailed(false);
    setLoading(Boolean(nextResolved && needsAuthDownload(nextResolved) && !nextCached));
  }, [uri]);

  useEffect(() => {
    if (!resolved || !needsAuthDownload(resolved)) {
      setLoading(false);
      return;
    }
    const alreadyCached = URI_CACHE.get(resolved);
    if (alreadyCached) {
      setRenderUri(alreadyCached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const local = await prefetchAuthImage(resolved, token);
      if (cancelled) return;
      if (local) setRenderUri(local);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved, token]);

  const handleError = useCallback(
    (e: Parameters<NonNullable<ImageProps["onError"]>>[0]) => {
      if (!failed && resolved && needsAuthDownload(resolved)) {
        setFailed(true);
        void (async () => {
          const local = await fetchAuthImageLocalUri(resolved, token);
          if (local) {
            setRenderUri(local);
            setFailed(false);
            return;
          }
          onError?.(e);
        })();
        return;
      }
      onError?.(e);
    },
    [failed, onError, resolved, token]
  );

  if (!renderUri) {
    if (!showPlaceholder) return null;
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="image-outline" size={28} color={GatiMitraMerchant.textTertiary} />
      </View>
    );
  }

  if (needsAuthDownload(renderUri) && loading) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
      </View>
    );
  }

  if (failed) {
    if (!showPlaceholder) return null;
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="image-outline" size={28} color={GatiMitraMerchant.textTertiary} />
      </View>
    );
  }

  return (
    <View style={style}>
      <Image
        {...imageProps}
        source={{ uri: renderUri }}
        style={StyleSheet.absoluteFill}
        onError={handleError}
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
