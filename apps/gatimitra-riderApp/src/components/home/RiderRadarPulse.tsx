import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Easing, AppState } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const RADAR_SIZE = 128;
export const RIDER_RADAR_SIZE = RADAR_SIZE;

/** @deprecated Map pulse removed — MagicFleet uses top pill radar only. */
export function RiderRadarPulse() {
  return null;
}

/** MagicFleet-style radar target with rotating red sweep. */
export function RadarTargetIcon({
  size = 26,
  enabled = true,
}: {
  size?: number;
  enabled?: boolean;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const start = () => {
      spin.setValue(0);
      anim.start();
    };
    const stop = () => anim.stop();
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [spin, enabled]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const ringSize = size + 4;

  return (
    <View style={[styles.iconShell, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10} fill="#FAFAFA" stroke="#D1D5DB" strokeWidth={1.1} />
        <Circle cx={12} cy={12} r={7.2} fill="none" stroke="#FECACA" strokeWidth={1} opacity={0.9} />
        <Circle cx={12} cy={12} r={4.4} fill="none" stroke="#FCA5A5" strokeWidth={1.1} opacity={0.95} />
      </Svg>

      <Animated.View
        style={[
          styles.sweepHost,
          { width: size, height: size, transform: [{ rotate }] },
        ]}
        pointerEvents="none"
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 12 L12 2 A10 10 0 0 1 21.2 8.8 Z"
            fill="rgba(239, 68, 68, 0.42)"
          />
          <Path
            d="M12 12 L12 2 A10 10 0 0 1 17.5 4.2 Z"
            fill="rgba(220, 38, 38, 0.55)"
          />
        </Svg>
      </Animated.View>

      <View style={styles.centerDotHost} pointerEvents="none">
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={1.6} fill="#DC2626" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sweepHost: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  centerDotHost: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
