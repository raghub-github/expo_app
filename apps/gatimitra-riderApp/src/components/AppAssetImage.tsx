import { useMemo } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "react-native";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetsStore } from "@/src/stores/appAssetsStore";
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
  const url = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  if (!url) return null;
  return (
    <Image
      source={{ uri: url }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function useAppAssetUrl(assetKey: string): string | null {
  return useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
}

export function useAppAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = useAppAssetUrl(assetKey);
  return useMemo(() => (url ? { uri: url } : null), [url]);
}

export function appAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = getAppAssetUrl(assetKey);
  return url ? { uri: url } : null;
}

export function appAssetAbsoluteUrl(assetKey: string): string | null {
  const fromStore = getAppAssetUrl(assetKey);
  if (fromStore) return fromStore;
  const proxy = getAppAssetProxyUrl(assetKey);
  return proxy ? toAbsoluteImageUrl(proxy) : null;
}
