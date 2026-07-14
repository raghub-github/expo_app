/**
 * Premium no-service empty state — reference-matched hero, motion, and CTA polish.
 */

import React, { useEffect } from "react";
import { View, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  NON_SERVICEABLE_STATUS_BAR_BG,
  useScreenChromeStore,
} from "@/store/screenChromeStore";
import { AppText } from "@/components/AppText";

const GREEN = "#22C55E";
const GREEN_LIGHT = "#4ADE80";
const GREEN_DARK = "#16A34A";
const TEAL = "rgba(52, 211, 153, 0.32)";
const TEAL_SOFT = "rgba(52, 211, 153, 0.16)";

const SKYLINE = [
  { w: 14, h: 26 },
  { w: 11, h: 38 },
  { w: 16, h: 30 },
  { w: 9, h: 44 },
  { w: 18, h: 28 },
  { w: 12, h: 40 },
  { w: 15, h: 32 },
  { w: 10, h: 36 },
  { w: 17, h: 24 },
];

const SCATTER = [
  { top: 16, left: 34, s: 4 },
  { top: 38, left: 18, s: 3 },
  { top: 22, right: 42, s: 4 },
  { top: 56, right: 20, s: 3 },
  { top: 10, right: 72, s: 3 },
  { top: 68, left: 52, s: 3 },
];

const ARC_TOP = [
  { x: 18, y: 118 },
  { x: 42, y: 96 },
  { x: 72, y: 80 },
  { x: 108, y: 72 },
  { x: 144, y: 80 },
  { x: 174, y: 96 },
  { x: 198, y: 118 },
];

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

function DottedArc() {
  return (
    <View style={styles.arcLayer} pointerEvents="none">
      {ARC_TOP.map((dot, i) => (
        <View
          key={i}
          style={[
            styles.arcDot,
            {
              left: dot.x,
              top: dot.y,
              opacity: 0.16 + i * 0.07,
              transform: [{ scale: 0.85 + (i % 2) * 0.15 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function HeroIllustration({ floatStyle }: { floatStyle: object }) {
  return (
    <Animated.View style={[styles.heroWrap, floatStyle]}>
      {SCATTER.map((d, i) => (
        <View
          key={i}
          style={[
            styles.scatterDot,
            {
              top: d.top,
              left: d.left,
              right: d.right,
              width: d.s,
              height: d.s,
              borderRadius: d.s / 2,
            },
          ]}
        />
      ))}

      <DottedArc />

      <View style={styles.skylineWrap}>
        <View style={styles.skylineRow}>
          {SKYLINE.map((bar, i) => (
            <View
              key={i}
              style={[styles.skylineBar, { width: bar.w, height: bar.h }]}
            />
          ))}
        </View>
        <View style={styles.bushRow}>
          <View style={styles.bush} />
          <View style={[styles.bush, styles.bushSm]} />
          <View style={styles.bush} />
        </View>
      </View>

      <LinearGradient
        colors={["rgba(167,243,208,0.55)", "rgba(209,250,229,0.28)", "rgba(255,255,255,0)"]}
        style={styles.haloOuter}
      />
      <View style={styles.haloMid} />
      <View style={styles.heroDisc}>
        <LinearGradient
          colors={["#FFFFFF", "#F8FFFB"]}
          style={styles.heroDiscInner}
        />
      </View>

      <View style={styles.diamondWrap}>
        <View style={styles.diamond}>
          <View style={styles.diamondInner}>
            <Ionicons name="leaf" size={36} color={GREEN} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function LeafCluster({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  return (
    <View
      style={[
        styles.leafCluster,
        isLeft ? styles.leafClusterLeft : styles.leafClusterRight,
      ]}
    >
      <View style={styles.leafGlow} />
      <Ionicons
        name="leaf"
        size={14}
        color="rgba(34,197,94,0.45)"
        style={[
          styles.leafAccent,
          isLeft ? styles.leafAccentLeft : styles.leafAccentRight,
        ]}
      />
      <Ionicons
        name="leaf"
        size={isLeft ? 30 : 28}
        color={isLeft ? GREEN : GREEN_DARK}
        style={isLeft ? styles.leafMainLeft : styles.leafMainRight}
      />
      <View style={[styles.grassBlade, isLeft ? styles.grassLeftA : styles.grassRightA]} />
      <View style={[styles.grassBlade, isLeft ? styles.grassLeftB : styles.grassRightB]} />
    </View>
  );
}

function PremiumFooter() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 6);
  const footerH = 132 + bottomPad;

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

      <View style={[StyleSheet.absoluteFillObject, { justifyContent: "flex-end", paddingBottom: bottomPad }]}>
        <View style={styles.footerLeafRow}>
          <LeafCluster side="left" />
          <LeafCluster side="right" />
        </View>
      </View>
    </View>
  );
}

export function GMEmptyState({ header }: { header?: React.ReactNode }) {
  const router = useRouter();
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);
  const setImmersiveStatusBarChrome = useScreenChromeStore((s) => s.setImmersiveStatusBarChrome);
  const heroY = useSharedValue(0);
  const fade = useSharedValue(0);
  const copyY = useSharedValue(14);
  const ctaY = useSharedValue(18);

  useEffect(() => {
    setImmersiveStatusBarChrome(false);
    setStatusBarBackground(NON_SERVICEABLE_STATUS_BAR_BG, "dark");
    return () => resetStatusBarBackground();
  }, [setImmersiveStatusBarChrome, setStatusBarBackground, resetStatusBarBackground]);

  useEffect(() => {
    heroY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    fade.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    copyY.value = withDelay(
      120,
      withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) })
    );
    ctaY.value = withDelay(
      220,
      withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
  }, [heroY, fade, copyY, ctaY]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: heroY.value }],
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: copyY.value }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: ctaY.value }],
  }));

  return (
    <View style={styles.screen}>
      <AmbientBackground />
      {header}

      <View style={styles.body}>
        <HeroIllustration floatStyle={heroStyle} />

        <Animated.View style={[styles.copyBlock, copyStyle]}>
          <AppText style={styles.title}>We're not serving here yet 🌱</AppText>
          <AppText style={styles.subtitle}>
            GatiMitra is <AppText style={styles.subtitleAccent}>expanding fast.</AppText>
            {"\n"}Try another nearby location.
          </AppText>
        </Animated.View>

        <Animated.View style={[styles.ctaWrap, ctaStyle]}>
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
        </Animated.View>
      </View>

      <PremiumFooter />
    </View>
  );
}

const HERO_W = 240;
const HERO_H = 220;

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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 96,
    marginTop: -8,
  },
  heroWrap: {
    width: HERO_W,
    height: HERO_H,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  scatterDot: {
    position: "absolute",
    backgroundColor: TEAL_SOFT,
  },
  arcLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  arcDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GREEN,
  },
  skylineWrap: {
    position: "absolute",
    bottom: 54,
    alignItems: "center",
  },
  skylineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 44,
    marginBottom: 5,
  },
  skylineBar: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: TEAL,
  },
  bushRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  bush: {
    width: 22,
    height: 12,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: TEAL_SOFT,
  },
  bushSm: {
    width: 16,
    height: 9,
  },
  haloOuter: {
    position: "absolute",
    bottom: 24,
    width: 176,
    height: 176,
    borderRadius: 88,
  },
  haloMid: {
    position: "absolute",
    bottom: 44,
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: "rgba(236,253,245,0.75)",
  },
  heroDisc: {
    position: "absolute",
    bottom: 58,
    width: 112,
    height: 112,
    borderRadius: 56,
    ...(Platform.OS === "ios" && {
      shadowColor: GREEN,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 22,
    }),
    elevation: 6,
  },
  heroDiscInner: {
    flex: 1,
    borderRadius: 56,
  },
  diamondWrap: {
    position: "absolute",
    bottom: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  diamond: {
    width: 78,
    height: 78,
    transform: [{ rotate: "45deg" }],
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    ...(Platform.OS === "ios" && {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
    }),
    elevation: 5,
  },
  diamondInner: {
    transform: [{ rotate: "-45deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    alignItems: "center",
    marginBottom: 28,
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
  ctaWrap: {
    alignSelf: "stretch",
    paddingHorizontal: 4,
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
  footerLeafRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    minHeight: 52,
  },
  leafCluster: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  leafClusterLeft: {
    alignItems: "flex-start",
  },
  leafClusterRight: {
    alignItems: "flex-end",
  },
  leafGlow: {
    position: "absolute",
    bottom: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(167,243,208,0.35)",
  },
  leafAccent: {
    position: "absolute",
    bottom: 18,
  },
  leafAccentLeft: {
    left: 2,
    transform: [{ rotate: "-48deg" }],
  },
  leafAccentRight: {
    right: 0,
    transform: [{ rotate: "42deg" }, { scaleX: -1 }],
  },
  leafMainLeft: {
    transform: [{ rotate: "-32deg" }],
    marginBottom: 2,
    marginLeft: 4,
  },
  leafMainRight: {
    transform: [{ rotate: "28deg" }, { scaleX: -1 }],
    marginBottom: 2,
    marginRight: 2,
  },
  grassBlade: {
    position: "absolute",
    width: 3,
    height: 11,
    borderRadius: 2,
    backgroundColor: "rgba(34,197,94,0.35)",
  },
  grassLeftA: {
    left: 28,
    bottom: 0,
    transform: [{ rotate: "18deg" }],
  },
  grassLeftB: {
    left: 36,
    bottom: 1,
    height: 8,
    transform: [{ rotate: "32deg" }],
    opacity: 0.7,
  },
  grassRightA: {
    right: 30,
    bottom: 0,
    transform: [{ rotate: "-20deg" }],
  },
  grassRightB: {
    right: 38,
    bottom: 1,
    height: 8,
    transform: [{ rotate: "-34deg" }],
    opacity: 0.7,
  },
});
