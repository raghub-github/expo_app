/**
 * Non-serviceable / empty state: no stores within 15 km.
 * Only header + this section visible. Clean, intentional, no delivery UI.
 */

import { useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, TouchableOpacity, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FOOD_HOME_FALLBACK, safeRouterBack } from "@/lib/safeRouterBack";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";

const CONTAINER_MAX_WIDTH = 420;
const ILLUSTRATION_SIZE = 130;
const HEADING_COLOR = "#1F2937";
const DESC_COLOR = "#6B7280";
const CTA_GRADIENT = ["#27AE60", "#2ECC71"] as const;

type EmptyRestaurantsNearbyProps = {
  ctaLabel?: string;
  onPress?: () => void;
  dark?: boolean;
};

export function EmptyRestaurantsNearby({
  ctaLabel = "Back to home",
  onPress,
  dark = false,
}: EmptyRestaurantsNearbyProps) {
  const router = useRouter();
  const float = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const onCtaPress = () => {
    if (Platform.OS !== "web" && "vibrate" in navigator) {
      (navigator as { vibrate?: (ms: number) => void }).vibrate?.(40);
    }
    if (onPress) {
      onPress();
      return;
    }
    safeRouterBack(router, FOOD_HOME_FALLBACK);
  };

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }]}>
      <Animated.View
        style={[
          styles.iconWrap,
          dark && styles.iconWrapDark,
          { transform: [{ translateY }] },
        ]}
      >
        <Ionicons name="leaf" size={64} color={dark ? DiscoveryColors.teal : "#27AE60"} />
      </Animated.View>
      <AppText style={[styles.title, dark && styles.titleDark]}>
        Looks like we're still finding great kitchens near you 🌿
      </AppText>
      <AppText style={[styles.subtitle, dark && styles.subtitleDark]}>
        We're expanding fast — try another nearby location or check back soon.
      </AppText>
      <TouchableOpacity
        onPress={onCtaPress}
        activeOpacity={0.85}
        style={styles.ctaTouchable}
      >
        <LinearGradient
          colors={CTA_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          <Ionicons name="home-outline" size={20} color="#fff" />
          <AppText style={styles.ctaText}>{ctaLabel}</AppText>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxWidth: CONTAINER_MAX_WIDTH,
    width: "100%",
    alignSelf: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    textAlign: "center",
  },
  iconWrap: {
    width: ILLUSTRATION_SIZE,
    height: ILLUSTRATION_SIZE,
    borderRadius: ILLUSTRATION_SIZE / 2,
    backgroundColor: "#E8F5F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  iconWrapDark: {
    backgroundColor: "rgba(45, 212, 191, 0.16)",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: HEADING_COLOR,
    textAlign: "center",
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  titleDark: {
    color: DiscoveryColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: DESC_COLOR,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320,
    marginBottom: 28,
  },
  subtitleDark: {
    color: DiscoveryColors.textMuted,
  },
  ctaTouchable: {
    borderRadius: 14,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#27AE60",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 18,
        }
      : { elevation: 6 }),
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
