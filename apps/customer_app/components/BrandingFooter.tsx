/**
 * GatiMitra branding signature – page-end footer.
 * Tagline (brand accent) + brand name (soft watermark).
 * Home variant: underline width matches measured "GatiMitra" text exactly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, type LayoutChangeEvent } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppText } from "@/components/AppText";

const BRAND_LABEL = "GatiMitra";
const TAGLINE = "Made for Your Moments";

const FADE_DURATION = 500;

/** Soft gray for watermark-style brand name (GatiMitra footer). */
const WATERMARK_GRAY = "rgba(107, 114, 128, 0.55)";

type BrandingFooterProps = {
  /** Home tab reference: teal sparkles tagline + bold black logo + teal rule */
  variant?: "default" | "home" | "discovery";
  /** Less vertical padding for dense pages (e.g. checkout). */
  compact?: boolean;
};

export function BrandingFooter({ variant = "default", compact = false }: BrandingFooterProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [brandWidth, setBrandWidth] = useState(0);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const onBrandLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setBrandWidth((prev) => (prev === w ? prev : w));
  }, []);

  const isHome = variant === "home";
  const isDiscovery = variant === "discovery";

  return (
    <Animated.View
      style={[
        styles.wrap,
        isHome && styles.wrapHome,
        compact && styles.wrapCompact,
        { opacity },
      ]}
      pointerEvents="none"
    >
      {isHome ? null : (
        <View style={[styles.divider, isDiscovery && styles.dividerDiscovery]} />
      )}
      {isHome ? (
        <AppText style={styles.taglineHome} bold>
          ✨ {TAGLINE} ✨
        </AppText>
      ) : (
        <AppText style={[styles.tagline, isDiscovery && styles.taglineDiscovery]} bold>
          {TAGLINE}
        </AppText>
      )}
      <View style={styles.brandTextWrap}>
        <AppText
          style={[
            styles.brandText,
            isHome && styles.brandTextHome,
            isDiscovery && styles.brandTextDiscovery,
          ]}
          bold
          onLayout={isHome ? onBrandLayout : undefined}
        >
          {BRAND_LABEL}
        </AppText>
      </View>
      {isHome && brandWidth > 0 ? (
        <View style={[styles.homeRule, { width: brandWidth }]} />
      ) : null}
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
  dividerDiscovery: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  tagline: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.primaryMint,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  taglineDiscovery: {
    color: "#5EEAD4",
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
  brandTextDiscovery: {
    color: "rgba(255, 255, 255, 0.22)",
  },
  wrapHome: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  taglineHome: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.splashMint,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  brandTextHome: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.4,
    transform: [{ scaleX: 1 }],
  },
  homeRule: {
    height: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.splashMint,
    marginTop: 6,
    alignSelf: "center",
  },
});
