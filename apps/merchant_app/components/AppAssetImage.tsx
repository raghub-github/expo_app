import { useEffect, useState, type ReactNode } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  getAppAssetDisplayUrls,
  getAppAssetUrl,
  useAppAssetUrl,
} from "@/store/appAssetsStore";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
  /** Shown when CMS has no uploaded URL for this slot. */
  fallback?: ReactNode;
};

function resizeModeToContentFit(
  mode: Props["resizeMode"]
): "cover" | "contain" | "fill" | "none" | "scale-down" {
  if (mode === "cover") return "cover";
  if (mode === "stretch") return "fill";
  if (mode === "center") return "none";
  return "contain";
}

/**
 * CMS image — uses the asset map from AppAssetsPrefetch (no nested fetch loops).
 */
export function AppAssetImage({
  assetKey,
  style,
  resizeMode = "contain",
  accessibilityLabel,
  fallback = null,
}: Props) {
  const storeUrl = useAppAssetUrl(assetKey);
  const secondary = getAppAssetDisplayUrls(assetKey).secondary;
  const [urlOverride, setUrlOverride] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrlOverride(null);
    setFailed(false);
  }, [assetKey]);

  const displayUrl = failed ? null : (urlOverride ?? storeUrl);

  if (!displayUrl) {
    return <>{fallback}</>;
  }

  return (
    <ExpoImage
      source={{ uri: displayUrl }}
      style={[style, styles.transparent]}
      contentFit={resizeModeToContentFit(resizeMode)}
      cachePolicy="memory-disk"
      recyclingKey={assetKey}
      accessibilityLabel={accessibilityLabel}
      transition={0}
      onError={() => {
        if (!urlOverride && secondary && secondary !== displayUrl) {
          setUrlOverride(secondary);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

const styles = StyleSheet.create({
  transparent: {
    backgroundColor: "transparent",
  },
});

export function appAssetSource(assetKey: string): ImageSourcePropType | null {
  const url = getAppAssetUrl(assetKey);
  return url ? { uri: url } : null;
}

export function appAssetAbsoluteUrl(assetKey: string): string | null {
  return getAppAssetUrl(assetKey);
}
