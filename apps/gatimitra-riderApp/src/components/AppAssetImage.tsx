import { useMemo } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "react-native";
import {
  getAppAssetUrl,
  getAppAssetProxyUrl,
  getAppAssetLocalUri,
  useAppAssetsStore,
} from "@/src/stores/appAssetsStore";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
};

export function AppAssetImage({
  assetKey,
  style,
  resizeMode = "contain",
  accessibilityLabel,
}: Props) {
  const uri = useAppAssetsStore((s) => {
    const local = s.localFiles[assetKey]?.trim();
    if (local) return local;
    const raw = s.assets[assetKey]?.proxyUrl?.trim() || s.assets[assetKey]?.url?.trim() || null;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  });
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function useAppAssetUrl(assetKey: string): string | null {
  return useAppAssetsStore((s) => {
    const local = s.localFiles[assetKey]?.trim();
    if (local) return local;
    return s.assets[assetKey]?.url ?? null;
  });
}

export function useAppAssetSource(assetKey: string): ImageSourcePropType | null {
  const uri = useAppAssetsStore((s) => {
    const local = s.localFiles[assetKey]?.trim();
    if (local) return local;
    const raw = s.assets[assetKey]?.proxyUrl?.trim() || s.assets[assetKey]?.url?.trim() || null;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  });
  return useMemo(() => (uri ? { uri } : null), [uri]);
}

export function appAssetSource(assetKey: string): ImageSourcePropType | null {
  const local = getAppAssetLocalUri(assetKey);
  if (local) return { uri: local };
  const url = getAppAssetUrl(assetKey);
  return url ? { uri: url } : null;
}

export function appAssetAbsoluteUrl(assetKey: string): string | null {
  const local = getAppAssetLocalUri(assetKey);
  if (local) return local;
  const fromStore = getAppAssetUrl(assetKey);
  if (fromStore) return fromStore;
  const proxy = getAppAssetProxyUrl(assetKey);
  return proxy ? toAbsoluteImageUrl(proxy) : null;
}
