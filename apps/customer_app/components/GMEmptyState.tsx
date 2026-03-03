/**
 * 2025 Smart Empty State – when NO store within 15km.
 * Premium illustration + message + Change Location only.
 * Message: "We're not serving here yet 🌿 But GatiMitra is expanding fast."
 */

import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";

const FLOAT_AMPLITUDE = 8;
const FLOAT_DURATION = 2500;

export function GMEmptyState() {
  const router = useRouter();
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [opacity]);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-FLOAT_AMPLITUDE, { duration: FLOAT_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: FLOAT_DURATION / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [translateY]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const onChangeLocation = () => {
    router.push("/location");
  };

  return (
    <Animated.View style={[styles.wrap, containerStyle]}>
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <LinearGradient
          colors={[GatiMitraColors.mintSoft, "rgba(34,197,94,0.15)"]}
          style={styles.iconGradient}
        >
          <Ionicons name="leaf" size={56} color={GatiMitraColors.primaryMint} />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.title}>
        We're not serving here yet 🌱
      </Text>
      <Text style={styles.subtitle}>
        GatiMitra is expanding fast.
      </Text>
      <Text style={styles.hint}>
        Try another nearby location.
      </Text>
      <TouchableOpacity
        onPress={onChangeLocation}
        activeOpacity={0.9}
        style={styles.ctaTouchable}
      >
        <LinearGradient
          colors={GatiMitraColors.deepMintGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          <Ionicons name="location" size={20} color="#fff" />
          <Text style={styles.ctaText}>Change Location</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
    overflow: "hidden",
    ...(Platform.OS === "ios" && {
      shadowColor: GatiMitraColors.primaryMint,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
    }),
    elevation: 4,
  },
  iconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: 28,
  },
  ctaTouchable: {
    borderRadius: 16,
    overflow: "hidden",
    ...(Platform.OS === "ios" && {
      shadowColor: GatiMitraColors.deepMintStart,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
    }),
    elevation: 6,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
