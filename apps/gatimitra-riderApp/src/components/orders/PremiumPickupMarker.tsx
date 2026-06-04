import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

type Props = {
  label?: string;
  /** Drop leg uses blue; pickup/restaurant uses green. */
  variant?: "pickup" | "drop";
  dimmed?: boolean;
};

const PICKUP_PIN = colors.success[600];
const DROP_PIN = "#1A73E8";

/** Large destination pin with label — Mapbox MarkerView (reference design). */
export function PremiumPickupMarker({
  label = "Pickup",
  variant = "pickup",
  dimmed = false,
}: Props) {
  const pinColor = variant === "drop" ? DROP_PIN : PICKUP_PIN;
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.5);

  useEffect(() => {
    ringScale.value = withRepeat(
      withTiming(2.6, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    ringOpacity.value = withRepeat(
      withTiming(0, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [ringOpacity, ringScale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <View style={[styles.wrap, dimmed && styles.wrapDimmed]} collapsable={false}>
      <View style={[styles.pill, { backgroundColor: pinColor, borderColor: "#fff" }]}>
        <Text style={styles.pillText}>{label}</Text>
      </View>
      <View style={styles.pinCol}>
        <Animated.View style={[styles.pulse, ringStyle, { backgroundColor: pinColor }]} />
        <View style={[styles.glow, { backgroundColor: pinColor }]} />
        <View style={[styles.pinHead, { backgroundColor: pinColor }]} />
        <View style={[styles.pinStem, { backgroundColor: pinColor }]} />
        <View style={[styles.pinDot, { backgroundColor: pinColor }]} />
      </View>
    </View>
  );
}

export const NAV_PICKUP_MARKER_W = 88;
export const NAV_PICKUP_MARKER_H = 96;

const styles = StyleSheet.create({
  wrap: {
    width: NAV_PICKUP_MARKER_W,
    height: NAV_PICKUP_MARKER_H,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  wrapDimmed: {
    opacity: 0.72,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: "#fff",
    minWidth: 76,
    alignItems: "center",
    marginBottom: 6,
    zIndex: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  pillText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  pinCol: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  pulse: {
    position: "absolute",
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    opacity: 0.35,
  },
  glow: {
    position: "absolute",
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.45,
  },
  pinHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#fff",
    zIndex: 3,
    marginBottom: -1,
  },
  pinStem: {
    width: 4,
    height: 10,
    zIndex: 2,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.5,
    borderColor: "#fff",
    zIndex: 3,
  },
});
