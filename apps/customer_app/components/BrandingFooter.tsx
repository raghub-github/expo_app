/**
 * GatiMitra branding signature – page-end footer.
 * Tagline (brand accent) + brand name (soft watermark).
 * Minimal, elegant, blends with page ending.
 */

import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppText } from "@/components/AppText";

const BRAND_LABEL = "GatiMitra";
const TAGLINE = "Made for Your Moments";

const FADE_DURATION = 500;

/** Soft gray for watermark-style brand name (GatiMitra footer). */
const WATERMARK_GRAY = "rgba(107, 114, 128, 0.55)";

type BrandingFooterProps = {
  /** Home tab reference: teal sparkles tagline + bold black logo + teal rule */
  variant?: "default" | "home";
  /** Less vertical padding for dense pages (e.g. checkout). */
  compact?: boolean;
};

export function BrandingFooter({ variant = "default", compact = false }: BrandingFooterProps) {
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
    <Animated.View
      style={[styles.wrap, isHome && styles.wrapHome, compact && styles.wrapCompact, { opacity }]}
      pointerEvents="none"
    >
      {isHome ? null : <View style={styles.divider} />}
      {isHome ? (
        <AppText style={styles.taglineHome} bold>
          ✨ {TAGLINE} ✨
        </AppText>
      ) : (
        <AppText style={styles.tagline} bold>
          {TAGLINE}
        </AppText>
      )}
      <View style={styles.brandTextWrap}>
        <AppText style={[styles.brandText, isHome && styles.brandTextHome]} bold>
          {BRAND_LABEL}
        </AppText>
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
  wrapCompact: {
    paddingTop: 12,
    paddingBottom: 10,
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
