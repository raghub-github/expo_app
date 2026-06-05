import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

type Props = {
  label: string;
  subtitle?: string;
};

export function TripStatusMapPill({ label, subtitle }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, pulseStyle]}>
      <View style={styles.dot} />
      <View style={styles.textCol}>
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const pillShadow = Platform.select({
  ios: {
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  android: { elevation: 8 },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gray[100],
    maxWidth: "92%",
    ...pillShadow,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success[500],
  },
  textCol: {
    flexShrink: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.gray[900],
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[500],
    marginTop: 2,
    includeFontPadding: false,
  },
});
