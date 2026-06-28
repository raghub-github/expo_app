import { useMemo } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "expo-image";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  accessibilityLabel?: string;
};

/** Renders a CMS-managed image from backend (R2 proxy). */
export function AppAssetImage({
  assetKey,
  style,
  contentFit = "contain",
  accessibilityLabel,
}: Props) {
  const url = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? null);
  if (!url) return null;
  return (
    <Image
      source={{ uri: url }}
      style={style}
      contentFit={contentFit}
      accessibilityLabel={accessibilityLabel}
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
