/**
 * Home end-card — full-bleed dark band (no center bubble).
 *
 * Copy stack:
 *   One App. Endless
 *   Solutions.
 *   GatiMitra
 *   India's Everyday Super App.
 *
 * Fonts via AppText (Lora bold).
 */
import { useCallback } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { homeSkeletonLog } from "@/lib/homeSkeletonTelemetry";

const CARD_BG = "#25252A";
const HEADLINE = "#A8B7E4";
const WATERMARK = "rgba(255, 255, 255, 0.38)";
const TAGLINE = "rgba(255, 255, 255, 0.55)";

export const HOME_BRAND_BANNER_BOTTOM_GAP = 0;

type Props = {
  bannerHeight?: number;
  tabBarClearance?: number;
  skeleton?: boolean;
};

const TEXT_LEFT = 20;

export function HomeBrandBanner({ bannerHeight }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const brandUri = useAppAssetsStore(
    (s) => s.assets[CX.home.brandBanner]?.proxyUrl ?? s.assets[CX.home.brandBanner]?.url ?? null
  );
  const hasBrandUri = Boolean(brandUri?.trim());

  // +6px total vs original magicpin band for a touch more breathing room.
  const cardH = Math.min(206, Math.max(174, (bannerHeight ?? Math.round(screenH * 0.2)) + 6));
  const artW = Math.min(Math.round(screenW * 0.42), 170);
  const artH = Math.round(cardH * 0.95);

  const onArtLoad = useCallback(() => {
    homeSkeletonLog("CONTENT_RENDERED", "brand", "onLoad");
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { width: screenW, height: cardH, backgroundColor: CARD_BG }]}>
        <View style={styles.row}>
          <View style={styles.textCol}>
            <AppText bold style={styles.headlineTop} numberOfLines={1} allowFontScaling={false}>
              One App. Endless
            </AppText>
            <AppText bold style={styles.headlineSolutions} numberOfLines={1} allowFontScaling={false}>
              Solutions.
            </AppText>

            <AppText bold style={styles.watermark} numberOfLines={1} allowFontScaling={false}>
              GatiMitra
            </AppText>
            <AppText bold style={styles.tagline} numberOfLines={1} allowFontScaling={false}>
              {"India's Everyday Super App."}
            </AppText>
          </View>

          <View style={[styles.artCol, { width: artW }]}>
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 0,
    marginTop: 8,
    marginBottom: HOME_BRAND_BANNER_BOTTOM_GAP,
  },
  card: {
    borderRadius: 0,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingLeft: TEXT_LEFT,
    paddingRight: 8,
    paddingVertical: 14,
  },
  headlineTop: {
    fontSize: 20,
    lineHeight: 24,
    color: HEADLINE,
    letterSpacing: 0.45,
    includeFontPadding: false,
  },
  headlineSolutions: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 32,
    color: HEADLINE,
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  /** Gap between Solutions. and GatiMitra */
  watermark: {
    marginTop: 24,
    fontSize: 34,
    lineHeight: 38,
    color: WATERMARK,
    includeFontPadding: false,
  },
  tagline: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: TAGLINE,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  artCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    alignSelf: "stretch",
    marginRight: -2,
    marginBottom: -2,
    zIndex: 2,
  },
});
