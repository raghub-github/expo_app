import { Dimensions } from "react-native";
import type { BottomTabSceneInterpolationProps } from "@react-navigation/bottom-tabs";

const SCREEN_W = Dimensions.get("window").width;

/**
 * Full-width horizontal slide for main tabs.
 *
 * IMPORTANT: Do NOT use a short parallax (e.g. 0.28×width) without opacity —
 * inactive scenes stay on-screen and look “stuck at 50/50”. Off-screen tabs
 * must translate by a full screen width so only the focused page remains visible.
 *
 * Transform-only (no layout margin/width) — floating chrome stays fixed.
 */
export function forCustomerTabSlide({
  current,
}: BottomTabSceneInterpolationProps) {
  const translateX = current.progress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-SCREEN_W, 0, SCREEN_W],
    extrapolate: "clamp",
  });

  return {
    sceneStyle: {
      transform: [{ translateX }],
    },
  };
}

/** ~280ms — long enough to read as a slide; short enough to feel snappy. */
export const CUSTOMER_TAB_TRANSITION_SPEC = {
  animation: "timing" as const,
  config: {
    duration: 280,
    useNativeDriver: true,
  },
};
