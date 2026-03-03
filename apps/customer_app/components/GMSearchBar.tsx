/**
 * 2025 Next-gen search bar – fully rounded (32px radius), soft shadow.
 * Optional rotating placeholder: "Search biryani…", "Search restaurants…", "Search dishes near you…"
 * Mic icon with subtle animation. Use inside GMHeader or standalone.
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PLACEHOLDERS = [
  "Search biryani…",
  "Search restaurants…",
  "Search dishes near you…",
];
const ROTATE_INTERVAL_MS = 3500;
const PILL_RADIUS = 32;

export type GMSearchBarProps = {
  onPress: () => void;
  /** Rotate placeholder text */
  rotatingPlaceholder?: boolean;
  /** Override placeholder */
  placeholder?: string;
};

export function GMSearchBar({
  onPress,
  rotatingPlaceholder = true,
  placeholder,
}: GMSearchBarProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const micScale = useSharedValue(1);

  useEffect(() => {
    if (!rotatingPlaceholder) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [rotatingPlaceholder]);

  useEffect(() => {
    micScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, [micScale]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const text = placeholder ?? PLACEHOLDERS[placeholderIndex];

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <Ionicons name="search" size={20} color={GatiMitraColors.textSecondary} />
      <Text style={styles.placeholder} numberOfLines={1}>
        {text}
      </Text>
      <Animated.View style={micStyle}>
        <Ionicons name="mic-outline" size={20} color={GatiMitraColors.textPrimaryNew} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: PILL_RADIUS,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    }),
    elevation: 2,
  },
  placeholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
  },
});
