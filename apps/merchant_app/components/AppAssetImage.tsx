import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "react-native";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetUrl } from "@/store/appAssetsStore";
import { resolveImageUrl } from "@/services/outletApi";

type Props = {
  assetKey: string;
  /** Used when `assetKey` has no uploaded URL yet. */
  fallbackAssetKey?: string;
  /** Bundled image when neither CMS key has a URL (e.g. splash before assets load). */
  fallbackSource?: ImageSourcePropType | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
};

export function AppAssetImage({
  assetKey,
  fallbackAssetKey,
  fallbackSource = null,
  style,
  resizeMode = "contain",
  accessibilityLabel,
}: Props) {
  const primary = useAppAssetUrl(assetKey);
  const fallback = useAppAssetUrl(fallbackAssetKey ?? "");
  const url = primary || fallback;
  const resolved = url ? resolveImageUrl(url) : null;
  const source = resolved ? { uri: resolved } : fallbackSource;
  if (!source) return null;
  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function appAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = getAppAssetUrl(assetKey);
  return url ? { uri: url } : null;
}

export function appAssetAbsoluteUrl(assetKey: string): string | null {
  const fromStore = getAppAssetUrl(assetKey);
  if (fromStore) return resolveImageUrl(fromStore);
  const proxy = getAppAssetProxyUrl(assetKey);
  return proxy ? resolveImageUrl(proxy) : null;
}
