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

type BrandingFooterProps = {
  /** Home tab reference: teal sparkles tagline + bold black logo + teal rule */
  variant?: "default" | "home";
};

export function BrandingFooter({ variant = "default" }: BrandingFooterProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const isHome = variant === "home";

  return (
    <Animated.View style={[styles.wrap, isHome && styles.wrapHome, { opacity }]} pointerEvents="none">
      {isHome ? null : <View style={styles.divider} />}
      {isHome ? (
        <Text style={styles.taglineHome}>
          <Text style={styles.sparkle}>✨ </Text>
          {TAGLINE}
          <Text style={styles.sparkle}> ✨</Text>
        </Text>
      ) : (
        <Text style={styles.tagline}>{TAGLINE}</Text>
      )}
      <View style={styles.brandTextWrap}>
        <Text style={[styles.brandText, isHome && styles.brandTextHome]}>{BRAND_LABEL}</Text>
      </View>
      {isHome ? <View style={styles.homeRule} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 20,
    paddingBottom: 24,
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
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.primaryMint,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  brandTextWrap: {
    marginTop: 6,
    alignItems: "center",
    overflow: "visible",
  },
  brandText: {
    fontSize: 28,
    fontWeight: "800",
    color: WATERMARK_GRAY,
    textAlign: "center",
    letterSpacing: 1.5,
    transform: [{ scaleX: 1.05 }],
  },
  wrapHome: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  taglineHome: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.splashMint,
    textAlign: "center",
  },
  sparkle: {
    color: GatiMitraColors.splashMint,
  },
  brandTextHome: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.5,
    transform: [{ scaleX: 1 }],
  },
  homeRule: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.splashMint,
    marginTop: 6,
  },
});
