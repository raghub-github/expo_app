import React, { useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const AUTO_HIDE_MS = 2600;

type Props = {
  visible: boolean;
  message?: string;
  onDismiss?: () => void;
};

export function PickupUpdatedBanner({
  visible,
  message = "Pickup location updated",
  onDismiss,
}: Props) {
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 16, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 220 });
      const t = setTimeout(() => {
        translateY.value = withTiming(-80, { duration: 280 });
        opacity.value = withTiming(0, { duration: 280 }, (finished) => {
          if (finished && onDismiss) runOnJS(onDismiss)();
        });
      }, AUTO_HIDE_MS);
      return () => clearTimeout(t);
    }
    translateY.value = -80;
    opacity.value = 0;
  }, [visible, onDismiss, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, animStyle]} pointerEvents="none">
      <View style={styles.pill}>
        <Ionicons name="location" size={18} color={colors.primary[700]} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 108 : 96,
    left: 16,
    right: 16,
    zIndex: 25,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.primary[200],
    maxWidth: "100%",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[900],
  },
});
