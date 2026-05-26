import { useEffect, useState } from "react";
import { StyleSheet, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { formatOrderDateTime, formatPlacedAgo } from "@/components/order/orderFormatters";

const TOGGLE_MS = 3500;

/** Partner Site OrderPanel PlacedTimeToggle — alternates clock time / relative ago with fade. */
export function AnimatedPlacedTime({
  createdAt,
  nowMs,
  style,
}: {
  createdAt: string;
  nowMs: number;
  style?: TextStyle;
}) {
  const [showRelative, setShowRelative] = useState(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => {
      opacity.value = withSequence(
        withTiming(0, { duration: 160, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 220, easing: Easing.in(Easing.ease) })
      );
      setShowRelative((v) => !v);
    }, TOGGLE_MS);
    return () => clearInterval(id);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const label = showRelative
    ? formatPlacedAgo(createdAt, nowMs)
    : formatOrderDateTime(createdAt);

  return (
    <Animated.Text style={[styles.time, style, animStyle]} numberOfLines={1}>
      {label}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  time: {
    minWidth: 108,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
