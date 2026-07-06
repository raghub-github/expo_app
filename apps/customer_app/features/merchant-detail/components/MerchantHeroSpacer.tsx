import React from "react";
import { View, StyleSheet } from "react-native";
import { HEADER_IMAGE_HEIGHT, SCREEN_WIDTH_EXPORT } from "../constants/layout";

/** Scroll offset slot — hero image lives in MerchantFixedHeroLayer (never remounts). */
export const MerchantHeroSpacer = React.memo(function MerchantHeroSpacer() {
  return <View style={styles.spacer} collapsable={false} pointerEvents="none" />;
});

const styles = StyleSheet.create({
  spacer: {
    height: HEADER_IMAGE_HEIGHT,
    width: SCREEN_WIDTH_EXPORT,
    backgroundColor: "transparent",
  },
});
