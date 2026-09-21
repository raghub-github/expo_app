/**
 * Tab scene transition.
 *
 * Instant cut (duration 0). A 220ms slide left Food at zIndex 0 under Home
 * whenever native progress stalled on first layout — the previous page flashed
 * for seconds. Neighbors stay opacity 0 so Home never composites over Food.
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

export const CUSTOMER_TAB_TRANSITION_SPEC = {
  animation: "timing" as const,
  config: {
    duration: 0,
    useNativeDriver: true,
  },
};
