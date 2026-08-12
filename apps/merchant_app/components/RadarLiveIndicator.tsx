/**
 * Minimal radar-style live indicator — visual only, no text.
 * Center dot + 3 expanding pulse rings, staggered sonar effect.
 * Show only when store is ONLINE.
 */

import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";

const SIZE_DEFAULT = 32;
const SIZE_COMPACT = 24;
const CENTER_DOT_DEFAULT = 8;
const CENTER_DOT_COMPACT = 7;
const BRAND_GREEN = "#22C55E";
const RING_PURPLE = "#7C3AED";
const RING_BLUE = "#2563EB";
const RING_DARK = "#312E81"; // dark blue-black
const PULSE_DURATION = 1800;
const STAGGER_MS = 600;

type RadarLiveIndicatorProps = {
  /** Smaller footprint for list rows / dense UI */
  compact?: boolean;
};

export function RadarLiveIndicator({ compact }: RadarLiveIndicatorProps) {
  const SIZE = compact ? SIZE_COMPACT : SIZE_DEFAULT;
  const CENTER_DOT = compact ? CENTER_DOT_COMPACT : CENTER_DOT_DEFAULT;
  const RING_SIZE = SIZE;
  const RADIUS = RING_SIZE / 2;

  const s1 = useRef(new Animated.Value(0.25)).current;
  const o1 = useRef(new Animated.Value(0.3)).current;
  const s2 = useRef(new Animated.Value(0.25)).current;
  const o2 = useRef(new Animated.Value(0.3)).current;
  const s3 = useRef(new Animated.Value(0.25)).current;
  const o3 = useRef(new Animated.Value(0.3)).current;

  const runPulse = (scale: Animated.Value, opacity: Animated.Value, delay: number) => {
    const easeOut = Easing.out(Easing.ease);
    const expand = Animated.parallel([
      Animated.timing(scale, {
        toValue: 1.5,
        duration: PULSE_DURATION,
        easing: easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: PULSE_DURATION,
        easing: easeOut,
        useNativeDriver: true,
      }),
    ]);
    const reset = Animated.parallel([
      Animated.timing(scale, { toValue: 0.25, duration: 0, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 0, useNativeDriver: true }),
    ]);
    return Animated.loop(
      Animated.sequence([
        ...(delay > 0 ? [Animated.delay(delay)] : []),
        expand,
        reset,
      ])
    );
  };

  useEffect(() => {
    const a1 = runPulse(s1, o1, 0);
    const a2 = runPulse(s2, o2, STAGGER_MS);
    const a3 = runPulse(s3, o3, STAGGER_MS * 2);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [s1, o1, s2, o2, s3, o3]);

  return (
    <View style={[styles.wrap, { width: SIZE, height: SIZE }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.ring,
          styles.ringPurple,
          {
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RADIUS,
            opacity: o1,
            transform: [{ scale: s1 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ringBlue,
          {
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RADIUS,
            opacity: o2,
            transform: [{ scale: s2 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ringDark,
          {
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RADIUS,
            opacity: o3,
            transform: [{ scale: s3 }],
          },
        ]}
      />
      <View
        style={[
          styles.centerDot,
          {
            width: CENTER_DOT,
            height: CENTER_DOT,
            borderRadius: CENTER_DOT / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
  },
  ringPurple: { borderColor: RING_PURPLE },
  ringBlue: { borderColor: RING_BLUE },
  ringDark: { borderColor: RING_DARK },
  centerDot: {
    backgroundColor: BRAND_GREEN,
  },
});
