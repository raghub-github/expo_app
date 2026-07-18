/**
 * Premium no-service empty state — stable layout (no shift), live location header.
 */

import React, { useLayoutEffect, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  NON_SERVICEABLE_STATUS_BAR_BG,
  useScreenChromeStore,
} from "@/store/screenChromeStore";
import { AppText } from "@/components/AppText";
import { customerTabBarOffset } from "@/components/CustomerTabBar";
import { resolveChangeLocationCtaBottom } from "@/constants/layout";
import { useCartStore } from "@/store/cartStore";

const GREEN = "#22C55E";
const GREEN_LIGHT = "#4ADE80";
const GREEN_DARK = "#16A34A";

const BIKE_HERO = require("@/assets/bikeride-phone.png");
const HERO_W = 280;
const HERO_H = 240;
const COPY_BLOCK_MIN_H = 88;
const CTA_H = 56;

function AmbientBackground() {
  return (
    <>
      <LinearGradient
        colors={["#EFF9F3", "#F3FBF7", "#FAFDFB", "#FFFFFF"]}
        locations={[0, 0.22, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.ambientOrbHeader} pointerEvents="none" />
      <View style={styles.ambientOrbTop} pointerEvents="none" />
      <View style={styles.ambientOrbLeft} pointerEvents="none" />
      <View style={styles.ambientOrbRight} pointerEvents="none" />
    </>
  );
}

function PremiumFooter() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 6);
  const footerH = 100 + bottomPad;

  return (
    <View style={[styles.footer, { height: footerH }]} pointerEvents="none">
      <LinearGradient
        colors={["rgba(255,255,255,0)", "rgba(240,250,245,0.55)", "rgba(232,247,240,0.92)"]}
        locations={[0, 0.45, 1]}
        style={styles.footerFade}
      />

      <View style={[styles.wave, { width: width * 1.34, left: -width * 0.17, bottom: -52 + bottomPad * 0.2 }]}>
        <LinearGradient
          colors={["#F4FBF7", "#EAF7F0"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.waveFill, { height: 108 }]}
        />
      </View>

      <View style={[styles.wave, { width: width * 1.08, left: -width * 0.04, bottom: -58 + bottomPad * 0.15 }]}>
        <LinearGradient
          colors={["#ECF9F2", "#E2F3EA"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.waveFill, { height: 96 }]}
        />
      </View>

      <View style={[styles.wave, { width: width * 0.88, right: -width * 0.02, bottom: -64 + bottomPad * 0.1 }]}>
        <LinearGradient
          colors={["#E4F5EC", "#D6EDE2"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.waveFill, { height: 88 }]}
        />
      </View>

      <View style={[styles.waveHighlight, { width: width * 0.72, alignSelf: "center", bottom: 28 + bottomPad }]} />

      <View style={[styles.footerDots, { bottom: 36 + bottomPad }]}>
        {Array.from({ length: 11 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.footerDot,
              {
                opacity: 0.12 + (i % 3) * 0.06,
                marginTop: i % 2 === 0 ? 0 : 3,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function GMEmptyState({ header }: { header?: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const hasOtherStashedCarts = useCartStore((s) =>
    Object.values(s.stashedCarts).some((c) => c.items.length > 0)
  );
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);
  const setImmersiveStatusBarChrome = useScreenChromeStore((s) => s.setImmersiveStatusBarChrome);

  useLayoutEffect(() => {
    setImmersiveStatusBarChrome(false);
    setStatusBarBackground(NON_SERVICEABLE_STATUS_BAR_BG, "dark");
    return () => resetStatusBarBackground();
  }, [setImmersiveStatusBarChrome, setStatusBarBackground, resetStatusBarBackground]);

  const inTabs = segments[0] === "(tabs)";
  const ctaBottom = useMemo(
    () =>
      resolveChangeLocationCtaBottom({
        rawBottomInset: insets.bottom,
        // Food home no-service: floating cart can appear whenever the user has items.
        reserveFloatingCart: true,
        aboveTabBar: inTabs,
        tabBarOffset: inTabs ? customerTabBarOffset(insets.bottom) : undefined,
        withAllCartsTab: hasOtherStashedCarts,
      }),
    [hasOtherStashedCarts, inTabs, insets.bottom]
  );
  const bodyPaddingBottom = ctaBottom + CTA_H + 20;

  return (
    <View style={styles.screen}>
      <AmbientBackground />
      {header}

      <View style={[styles.body, { paddingBottom: bodyPaddingBottom }]}>
        <View style={styles.heroCenter}>
          <View style={styles.heroWrap}>
            <Image
              source={BIKE_HERO}
              style={styles.heroImage}
              resizeMode="contain"
              // Reserve layout immediately so decode doesn't shift the stack.
              fadeDuration={0}
            />
          </View>

          <View style={styles.copyBlock}>
            <AppText style={styles.title}>We're not serving here yet</AppText>
            <AppText style={styles.subtitle}>
              GatiMitra is <AppText style={styles.subtitleAccent}>expanding fast.</AppText>
              {"\n"}Try another nearby location.
            </AppText>
          </View>
        </View>
      </View>

      <View style={[styles.ctaDock, { bottom: ctaBottom }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.push("/location")}
          activeOpacity={0.9}
          style={styles.ctaTouchable}
        >
          <LinearGradient
            colors={[GREEN_LIGHT, GREEN, GREEN_DARK]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.cta}
          >
            <View style={styles.ctaIconWrap}>
              <Ionicons name="location-sharp" size={18} color="#fff" />
            </View>
            <AppText style={styles.ctaText}>Change Location</AppText>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <PremiumFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NON_SERVICEABLE_STATUS_BAR_BG,
  },
  ambientOrbHeader: {
    position: "absolute",
    top: -60,
    alignSelf: "center",
    width: 320,
    height: 220,
    borderRadius: 160,
    backgroundColor: "rgba(209,250,229,0.42)",
  },
  ambientOrbTop: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(167,243,208,0.16)",
  },
  ambientOrbLeft: {
    position: "absolute",
    top: 160,
    left: -90,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(209,250,229,0.32)",
  },
  ambientOrbRight: {
    position: "absolute",
    top: 120,
    right: -70,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(187,247,208,0.22)",
  },
  body: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  heroCenter: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  heroWrap: {
    width: HERO_W,
    height: HERO_H,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  heroImage: {
    width: HERO_W,
    height: HERO_H,
  },
  copyBlock: {
    alignItems: "center",
    minHeight: COPY_BLOCK_MIN_H,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    letterSpacing: -0.45,
    lineHeight: 31,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 25,
  },
  subtitleAccent: {
    color: GREEN,
    fontWeight: "700",
  },
  ctaDock: {
    position: "absolute",
    left: 28,
    right: 28,
    zIndex: 4,
  },
  ctaTouchable: {
    borderRadius: 999,
    overflow: "hidden",
    ...(Platform.OS === "ios" && {
      shadowColor: GREEN_DARK,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.26,
      shadowRadius: 18,
    }),
    elevation: 8,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: CTA_H,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  ctaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.15,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  footerFade: {
    ...StyleSheet.absoluteFillObject,
  },
  wave: {
    position: "absolute",
    overflow: "hidden",
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  waveFill: {
    width: "100%",
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  waveHighlight: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 1,
  },
  footerDots: {
    position: "absolute",
    left: "16%",
    right: "16%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    transform: [{ rotate: "-3deg" }],
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GREEN,
  },
});
