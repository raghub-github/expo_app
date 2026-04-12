/**
 * Soft mint orbs over the login gradient — subtle drift loops (matches static hero look).
 */

import { useEffect } from "react";
import { type DimensionValue, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type BubbleDef = {
  size: number;
  top: DimensionValue;
  left?: DimensionValue;
  right?: DimensionValue;
  backgroundColor: string;
  driftX: number;
  driftY: number;
  durationMs: number;
  delayMs: number;
};

const BUBBLES: BubbleDef[] = [
  {
    size: 220,
    top: "12%",
    right: "-12%",
    backgroundColor: "rgba(94, 217, 168, 0.18)",
    driftX: 10,
    driftY: -16,
    durationMs: 6500,
    delayMs: 0,
  },
  {
    size: 120,
    top: "8%",
    left: "-10%",
    backgroundColor: "rgba(94, 217, 168, 0.14)",
    driftX: -12,
    driftY: 14,
    durationMs: 7200,
    delayMs: 200,
  },
  {
    size: 90,
    top: "22%",
    left: "18%",
    backgroundColor: "rgba(125, 231, 192, 0.12)",
    driftX: 16,
    driftY: 10,
    durationMs: 5800,
    delayMs: 400,
  },
  {
    size: 150,
    top: "6%",
    right: "8%",
    backgroundColor: "rgba(94, 217, 168, 0.1)",
    driftX: -14,
    driftY: 18,
    durationMs: 8000,
    delayMs: 100,
  },
  {
    size: 72,
    top: "32%",
    left: "6%",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    driftX: 8,
    driftY: -12,
    durationMs: 5000,
    delayMs: 300,
  },
  {
    size: 100,
    top: "28%",
    right: "-6%",
    backgroundColor: "rgba(62, 180, 137, 0.11)",
    driftX: -10,
    driftY: -14,
    durationMs: 6800,
    delayMs: 500,
  },
];

function DriftingBubble(props: BubbleDef) {
  const { size, top, left, right, backgroundColor, driftX, driftY, durationMs, delayMs } = props;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const half = size / 2;

  useEffect(() => {
    tx.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(driftX, {
          duration: durationMs,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
    ty.value = withDelay(
      delayMs + 120,
      withRepeat(
        withTiming(driftY, {
          duration: durationMs * 1.15,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
    };
  }, [delayMs, driftX, driftY, durationMs]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top,
          ...(left !== undefined ? { left } : {}),
          ...(right !== undefined ? { right } : {}),
          width: size,
          height: size,
          borderRadius: half,
          backgroundColor,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function LoginHeroBubbles() {
  return (
    <View style={styles.layer} pointerEvents="none">
      {BUBBLES.map((bubble, index) => (
        <DriftingBubble key={index} {...bubble} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: StyleSheet.absoluteFillObject,
});
