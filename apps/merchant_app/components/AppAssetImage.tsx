import { useRef } from "react";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image as RNImage, StyleSheet } from "react-native";
import { getAppAssetUrl, useAppAssetUrl } from "@/store/appAssetsStore";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
};

function resizeModeToRn(
  mode: Props["resizeMode"]
): "cover" | "contain" | "stretch" | "repeat" | "center" {
  return mode === "cover" ||
    mode === "stretch" ||
    mode === "repeat" ||
    mode === "center"
    ? mode
    : "contain";
}

/**
 * CMS image from R2 signed URL.
 * Keeps the last good URL so tab switches / asset reloads do not flash blank.
 */
export function AppAssetImage({
  assetKey,
  style,
  resizeMode = "contain",
  accessibilityLabel,
}: Props) {
  const url = useAppAssetUrl(assetKey);
  const stickyRef = useRef<string | null>(url);
  if (url) stickyRef.current = url;
  const displayUrl = url ?? stickyRef.current;

  if (!displayUrl) {
    return null;
  }

  return (
    <RNImage
      source={{ uri: displayUrl }}
      style={[style, styles.transparent]}
      resizeMode={resizeModeToRn(resizeMode)}
      accessibilityLabel={accessibilityLabel}
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
