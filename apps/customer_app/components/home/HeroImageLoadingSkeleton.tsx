/**
 * Warm gold/cream shimmer shown while grid-first hero remote images load.
 * Matches Zomato Gold-strip energy instead of a blank beige hole.
 */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  GRID_FIRST_DEFAULT_HERO_BASE,
  GRID_FIRST_DEFAULT_HERO_DEEP,
  GRID_FIRST_DEFAULT_HERO_MID,
} from "@/components/home/GridFirstDefaultHeroBg";

const STRIP_W = 140;

type Props = {
  style?: object;
};

export function HeroImageLoadingSkeleton({ style }: Props) {
  const progress = useSharedValue(0);
  const boxW = useSharedValue(400);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -STRIP_W + progress.value * (boxW.value + STRIP_W * 2),
      },
    ],
  }));

  return (
    <View
      style={[styles.root, style]}
      pointerEvents="none"
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) boxW.value = w;
      }}
      accessibilityLabel="Loading offers"
    >
      <LinearGradient
        colors={[
          GRID_FIRST_DEFAULT_HERO_BASE,
          "#FFE9C2",
          GRID_FIRST_DEFAULT_HERO_MID,
          GRID_FIRST_DEFAULT_HERO_DEEP,
        ]}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Zomato-style promo strip silhouette near bottom */}
      <View style={styles.promoStrip}>
        <View style={styles.promoIcon} />
        <View style={styles.promoLines}>
          <View style={styles.promoLineLong} />
          <View style={styles.promoLineShort} />
        </View>
      </View>

      <Animated.View style={[styles.sweep, sweepStyle]}>
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.45)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: GRID_FIRST_DEFAULT_HERO_BASE,
  },
  promoStrip: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 236, 179, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(212, 168, 75, 0.35)",
  },
  promoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(180, 120, 40, 0.22)",
  },
  promoLines: {
    flex: 1,
    gap: 6,
  },
  promoLineLong: {
    height: 10,
    width: "88%",
    borderRadius: 5,
    backgroundColor: "rgba(146, 98, 32, 0.18)",
  },
  promoLineShort: {
    height: 8,
    width: "55%",
    borderRadius: 4,
    backgroundColor: "rgba(146, 98, 32, 0.12)",
  },
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: STRIP_W,
  },
});
