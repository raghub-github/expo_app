/**
 * GatiMitra branding signature – page-end footer.
 * Tagline (brand accent) + brand name (soft watermark).
 * Minimal, elegant, blends with page ending.
 */

import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND_LABEL = "GatiMitra";
const TAGLINE = "Made for Your Moments";

const FADE_DURATION = 500;

/** Soft gray for watermark-style brand name (Zomato-like footer). */
const WATERMARK_GRAY = "rgba(107, 114, 128, 0.55)";

export function BrandingFooter() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={styles.divider} />
      <Text style={styles.tagline}>{TAGLINE}</Text>
      <View style={styles.brandTextWrap}>
        <Text style={styles.brandText}>{BRAND_LABEL}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: "24%",
    height: 1,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    marginBottom: 10,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraColors.emerald,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  brandTextWrap: {
    marginTop: 4,
    alignItems: "center",
    overflow: "visible",
  },
  brandText: {
    fontSize: 18,
    fontWeight: "700",
    color: WATERMARK_GRAY,
    textAlign: "center",
    letterSpacing: 2,
    transform: [{ scaleX: 1.1 }],
  },
});
