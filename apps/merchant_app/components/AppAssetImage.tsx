import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Image as RNImage, StyleSheet } from "react-native";
import { getAppAssetUrl, useAppAssetUrl } from "@/store/appAssetsStore";

type Props = {
  assetKey: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  accessibilityLabel?: string;
};

function resizeModeToRn(mode: Props["resizeMode"]): "cover" | "contain" | "stretch" | "repeat" | "center" {
  return mode === "cover" || mode === "stretch" || mode === "repeat" || mode === "center"
    ? mode
    : "contain";
}

/** Renders super-admin CMS image from R2 signed URL only (no bundled fallbacks). */
export function AppAssetImage({
  assetKey,
  style,
  resizeMode = "contain",
  accessibilityLabel,
}: Props) {
  const url = useAppAssetUrl(assetKey);

  if (!url) {
    return null;
  }

  return (
    <RNImage
      key={`${assetKey}:${url}`}
      source={{ uri: url }}
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
