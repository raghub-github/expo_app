/**
 * Premium launch splash: full-bleed mint gradient, translucent status bar,
 * centered wordmark, optional “double door” exit (root) when app is ready.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";

const GRADIENT_TOP = "#5eead4";
const GRADIENT_BOTTOM = "#0d9488";
const DOOR_COLOR = "#0f766e";

export type GatiMitraBootstrapScreenProps = {
  /**
   * `root` — overlay on top of app; plays door exit when `appReady` becomes true.
   * `index` — inline full screen while resolving session (no door animation).
   */
  variant?: "root" | "index";
  /** When true (root only), door panels slide apart then `onExitComplete` runs. */
  appReady?: boolean;
  onExitComplete?: () => void;
};

export function GatiMitraBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
}: GatiMitraBootstrapScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const leftX = useSharedValue(0);
  const rightX = useSharedValue(0);
  const exitStartedRef = useRef(false);
  const completedRef = useRef(false);
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;

  const finishExit = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onExitRef.current?.();
  }, []);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (variant !== "root") return;
    void SystemUI.setBackgroundColorAsync(GRADIENT_BOTTOM);
    return () => {
      void SystemUI.setBackgroundColorAsync("#FFFFFF").catch(() => {});
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== "root" || !appReady || exitStartedRef.current) return;
    exitStartedRef.current = true;
    const travel = width * 0.52;
    const easing = Easing.bezier(0.22, 0.94, 0.36, 1);
    const duration = 820;
    leftX.value = withTiming(-travel, { duration, easing });
    rightX.value = withTiming(
      travel,
      { duration, easing },
      (finished) => {
        if (finished) {
          runOnJS(finishExit)();
        }
      }
    );
  }, [variant, appReady, width, leftX, rightX, finishExit]);

  const doorLeftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftX.value }],
  }));
  const doorRightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightX.value }],
  }));

  const bleedHeight = height + insets.top + insets.bottom;
  const bleedTop = -insets.top;

  const showDoors = variant === "root";

  const rootStyle =
    variant === "root"
      ? [StyleSheet.absoluteFillObject, styles.overlayRoot]
      : [styles.inlineRoot, { minHeight: height }];

  return (
    <View style={rootStyle} accessibilityLabel="GatiMitra loading">
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={[GRADIENT_TOP, GatiMitraColors.splashMint, GRADIENT_BOTTOM]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.gradient, { top: bleedTop, height: bleedHeight }]}
      />
      {showDoors ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.door,
              styles.doorLeft,
              doorLeftStyle,
              { top: bleedTop, height: bleedHeight, width: width * 0.51, backgroundColor: DOOR_COLOR },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.door,
              styles.doorRight,
              doorRightStyle,
              { top: bleedTop, height: bleedHeight, width: width * 0.51, backgroundColor: DOOR_COLOR },
            ]}
          />
        </>
      ) : null}
      <View style={styles.logoLayer} pointerEvents="none">
        <Text style={styles.title}>GatiMitra</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>CRAFTED FOR CONVENIENCE</Text>
        <ActivityIndicator
          style={{
            position: "absolute",
            alignSelf: "center",
            bottom: Math.max(28, insets.bottom + 18),
          }}
          size="small"
          color="rgba(255,255,255,0.9)"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 10000,
    elevation: 10000,
  },
  inlineRoot: {
    flex: 1,
    width: "100%",
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  door: {
    position: "absolute",
    top: 0,
  },
  doorLeft: {
    left: 0,
  },
  doorRight: {
    right: 0,
  },
  logoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.3,
  },
  divider: {
    width: "72%",
    maxWidth: 220,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginTop: 20,
    marginBottom: 18,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.94)",
    letterSpacing: 2.4,
    textAlign: "center",
  },
});
