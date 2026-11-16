/**
 * Branded footer banner — typography + scooter art paint immediately.
 * Never hide CMS art behind opacity:0 (that caused blank footer then a late pop-in).
 * Prefetch puts brand_banner at the front of the image queue during splash.
 *
 * Underline is measured from the live "GatiMitra" layout width so it is never
 * wider or narrower than the wordmark. Wordmark stays visually wider than the tagline.
 *
 * Bottom margin clears the floating tab bar — keep in sync with
 * useHomeScreenLayout BRAND_BOTTOM_GAP.
 */
import { useCallback, useState } from "react";
import { View, StyleSheet, Dimensions, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { AppText } from "@/components/AppText";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { homeSkeletonLog } from "@/lib/homeSkeletonTelemetry";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const BANNER_W = SCREEN_W - PAD * 2;
const GATI_GREEN = "#16A34A";
const SWOOSH_GREEN = "#22C55E";
const TAGLINE_GREEN = "#15803D";
const MITRA_DARK = "#0F172A";
const BG_GRADIENT = ["#E7F7F0", "#F4FCF8", "#EAF8F2"] as const;

/** Clearance under the card so the floating tab sheet never covers it. */
export const HOME_BRAND_BANNER_BOTTOM_GAP = 28;

function BokehBubble({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style: object;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

type Props = {
  bannerHeight?: number;
  /** Ignored — brand shell is always instant (kept for call-site compat). */
  skeleton?: boolean;
};
/** Tall enough for Lora “GatiMitra” + underline — shorter heights clipped the brand name. */
const DEFAULT_BANNER_H = 136;

export function HomeBrandBanner({ bannerHeight = DEFAULT_BANNER_H }: Props) {
  const brandUri = useAppAssetsStore(
    (s) => s.assets[CX.home.brandBanner]?.proxyUrl ?? s.assets[CX.home.brandBanner]?.url ?? null
  );
  const hasBrandUri = Boolean(brandUri?.trim());
  const resolvedH = Math.max(bannerHeight, DEFAULT_BANNER_H);
  const artH = Math.round(resolvedH * 0.9);
  const artW = Math.round(resolvedH * 1.14);
  const [brandWidth, setBrandWidth] = useState(0);

  const onBrandLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setBrandWidth((prev) => (prev === w ? prev : w));
  }, []);

  const onArtLoad = useCallback(() => {
    homeSkeletonLog("CONTENT_RENDERED", "brand", "onLoad");
  }, []);

  // Tagline must stay narrower than the measured "GatiMitra" wordmark.
  const taglineMaxW = brandWidth > 0 ? Math.max(72, Math.round(brandWidth * 0.92)) : undefined;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[...BG_GRADIENT]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.banner, { minHeight: resolvedH }]}
      >
        <BokehBubble size={78} color="rgba(255,255,255,0.55)" style={styles.bubbleA} />
        <BokehBubble size={52} color="rgba(167,243,208,0.32)" style={styles.bubbleB} />
        <BokehBubble size={40} color="rgba(255,255,255,0.36)" style={styles.bubbleC} />

        <View style={styles.textCol}>
          <AppText
            style={[styles.tagline, taglineMaxW != null ? { maxWidth: taglineMaxW } : null]}
            numberOfLines={1}
            bold
          >
            Made for your moments
          </AppText>
          <View style={styles.brandBlock}>
            <View style={styles.brandRow} onLayout={onBrandLayout}>
              <AppText style={styles.gati} bold>
                Gati
              </AppText>
              <AppText style={styles.mitra} bold>
                Mitra
              </AppText>
            </View>
            {brandWidth > 0 ? (
              <View
                style={[styles.underline, { width: brandWidth }]}
                pointerEvents="none"
                accessibilityElementsHidden
              />
            ) : null}
          </View>
        </View>
        <View style={[styles.artWrap, { height: artH, width: artW }]}>
          {hasBrandUri ? (
            <AppAssetImage
              assetKey={CX.home.brandBanner}
              style={{ width: artW, height: artH }}
              contentFit="contain"
              transition={0}
              onLoad={onArtLoad}
            />
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD,
    marginTop: 8,
    // Keep floating tab sheet from covering the card bottom edge.
    marginBottom: HOME_BRAND_BANNER_BOTTOM_GAP,
  },
  banner: {
    width: BANNER_W,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    paddingLeft: 20,
    paddingRight: 4,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(22, 163, 74, 0.12)",
    // Flat card — no drop shadow (reads as overlap under the tab sheet).
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  bubbleA: { top: -22, left: "18%" },
  bubbleB: { top: 10, left: "42%" },
  bubbleC: { bottom: -14, left: "28%" },
  textCol: {
    flex: 1,
    zIndex: 2,
    justifyContent: "center",
    paddingRight: 6,
    minWidth: 0,
  },
  tagline: {
    // Narrower than GatiMitra — hierarchy: brand first, tagline second.
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: TAGLINE_GREEN,
    letterSpacing: 0.15,
  },
  brandBlock: {
    marginTop: 8,
    alignItems: "flex-start",
    alignSelf: "flex-start",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
  },
  gati: {
    fontSize: 34,
    fontWeight: "900",
    color: GATI_GREEN,
    letterSpacing: -0.5,
    lineHeight: 40,
    includeFontPadding: false,
  },
  mitra: {
    fontSize: 34,
    fontWeight: "900",
    color: MITRA_DARK,
    letterSpacing: -0.5,
    lineHeight: 40,
    includeFontPadding: false,
  },
  /** Exact wordmark width — set from onLayout, never a fixed estimate. */
  underline: {
    height: 3,
    borderRadius: 999,
    backgroundColor: SWOOSH_GREEN,
    marginTop: 4,
  },
  artWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 2,
    alignSelf: "center",
  },
});
