/**
 * Full-width horizontal slide for main tabs.
 *
 * Bottom-tabs `current.progress` is **0 when focused** and ±1 when neighboring
 * (same convention as RN `forShift`). Inactive scenes must leave the viewport
 * by a full screen width AND must not paint (opacity 0) — otherwise Home stays
 * visible while Food “activates” and the user reads Food → Main Home → Food.
 *
 * Opacity is a hard cut (not a theatrical fade / delay). No setTimeout.
 */

import { Dimensions } from "react-native";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

type BottomTabSceneInterpolationProps = Parameters<
  NonNullable<BottomTabNavigationOptions["sceneStyleInterpolator"]>
>[0];

const FALLBACK_W = Dimensions.get("window").width;

export function forCustomerTabSlide({
  current,
}: BottomTabSceneInterpolationProps) {
  const width = FALLBACK_W;
  const progress = current.progress;
  const translateX = progress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-width, 0, width],
    extrapolate: "clamp",
  });
  // Hard exclusive visibility — neighbor never composites under the active tab.
  const opacity = progress.interpolate({
    inputRange: [-1, -0.001, 0, 0.001, 1],
    outputRange: [0, 0, 1, 0, 0],
    extrapolate: "clamp",
  });

  return {
    sceneStyle: {
      opacity,
      transform: [{ translateX }],
    },
  };
}

/** Snappy press-driven slide — animation duration, not a navigation delay. */
export const CUSTOMER_TAB_TRANSITION_SPEC = {
  animation: "timing" as const,
  config: {
    duration: 220,
    useNativeDriver: true,
  },
};
