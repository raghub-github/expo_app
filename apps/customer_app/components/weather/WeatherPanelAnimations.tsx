import { memo, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { WeatherPanelModel } from "@/lib/weatherPanelModel";

type Props = {
  animation: WeatherPanelModel["animation"];
};

function RainDrop({ left, delay }: { left: number; delay: number }) {
  const y = useSharedValue(-10);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(90, { duration: 900 + delay, easing: Easing.linear }),
        withTiming(-10, { duration: 0 })
      ),
      -1
    );
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: 0.35 + (left % 3) * 0.15,
  }));
  return <Animated.View style={[styles.rainDrop, { left: `${left}%` }, style]} />;
}

function FloatingCloud({ top, left, scale }: { top: number; left: number; scale: number }) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(
      withSequence(
        withTiming(12, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-12, { duration: 3200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale }],
  }));
  return <Animated.View style={[styles.cloud, { top, left: `${left}%` }, style]} />;
}

function SunRays() {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1);
  }, [rot]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  return <Animated.View style={[styles.sunRays, style]} />;
}

function WeatherPanelAnimationsInner({ animation }: Props) {
  if (animation === "none") return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      {animation === "rain" || animation === "thunder" ? (
        <>
          {Array.from({ length: 10 }).map((_, i) => (
            <RainDrop key={i} left={8 + i * 9} delay={i * 80} />
          ))}
        </>
      ) : null}

      {animation === "clouds" || animation === "fog" || animation === "rain" ? (
        <>
          <FloatingCloud top={12} left={10} scale={1} />
          <FloatingCloud top={28} left={55} scale={0.8} />
        </>
      ) : null}

      {animation === "sun" || animation === "heat" ? <SunRays /> : null}

      {animation === "snow" ? (
        <>
          {Array.from({ length: 8 }).map((_, i) => (
            <RainDrop key={`s-${i}`} left={6 + i * 11} delay={i * 120} />
          ))}
        </>
      ) : null}

      {animation === "wind" ? (
        <>
          <FloatingCloud top={18} left={20} scale={0.7} />
          <FloatingCloud top={34} left={65} scale={0.6} />
        </>
      ) : null}

      {animation === "fog" ? <View style={styles.fogLayer} /> : null}

      {animation === "thunder" ? <View style={styles.lightningFlash} /> : null}
    </View>
  );
}

export const WeatherPanelAnimations = memo(WeatherPanelAnimationsInner);

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  rainDrop: {
    position: "absolute",
    top: 0,
    width: 2,
    height: 14,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  cloud: {
    position: "absolute",
    width: 56,
    height: 22,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sunRays: {
    position: "absolute",
    top: 10,
    right: 18,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
  },
  fogLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  lightningFlash: {
    position: "absolute",
    top: 0,
    right: 24,
    width: 3,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.5)",
    transform: [{ rotate: "12deg" }],
  },
});
