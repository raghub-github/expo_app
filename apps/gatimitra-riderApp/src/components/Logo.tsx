import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { AppAssetImage, useAppAssetUrl } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

export interface LogoProps {
  size?: "small" | "medium" | "large" | "xlarge";
  iconOnly?: boolean;
  style?: ViewStyle;
  vertical?: boolean;
}

const sizeConfig = {
  small: { width: 120 },
  medium: { width: 180 },
  large: { width: 240 },
  xlarge: { width: 300 },
};

export function Logo({
  size = "medium",
  iconOnly = false,
  style,
}: LogoProps) {
  const config = sizeConfig[size];
  const remoteAppIcon = useAppAssetUrl(RX.brand.appIcon);
  const assetKey = iconOnly
    ? remoteAppIcon
      ? RX.brand.appIcon
      : RX.auth.onlyLogo
    : RX.auth.logo;
  const iconSize = iconOnly ? Math.round(config.width * 0.55) : config.width;

  return (
    <View style={[styles.container, style]}>
      <AppAssetImage
        assetKey={assetKey}
        style={{
          width: iconSize,
          height: iconOnly ? iconSize : config.width * 0.45,
        }}
        resizeMode="contain"
        accessibilityLabel="GatiMitra"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
