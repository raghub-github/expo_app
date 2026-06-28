import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image } from "react-native";
import { getAppAssetUrl, getAppAssetProxyUrl, useAppAssetUrl } from "@/store/appAssetsStore";
import { resolveImageUrl } from "@/services/outletApi";

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
  const url = useAppAssetUrl(assetKey);
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
