/**
 * Live responsive layout metrics for Rider UI.
 * Use this instead of one-shot Dimensions.get("window").
 */

import { useMemo } from "react";
import { PixelRatio, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildResponsiveMetrics,
  ensureTouchTarget,
  responsiveFont,
  responsiveHeight,
  responsiveIconSize,
  responsiveRadius,
  responsiveSpacing,
  responsiveWidth,
  space,
  type ResponsiveMetrics,
  type SpacingToken,
} from "@/src/theme/responsive";

export type ResponsiveLayout = ResponsiveMetrics & {
  insets: { top: number; bottom: number; left: number; right: number };
  /** Scaled helpers bound to current window. */
  rw: (size: number, options?: { min?: number; max?: number; factor?: number }) => number;
  rh: (size: number, options?: { min?: number; max?: number; factor?: number }) => number;
  rf: (size: number, options?: { min?: number; max?: number }) => number;
  rs: (size: number, options?: { min?: number; max?: number }) => number;
  ri: (size: number) => number;
  rr: (size: number) => number;
  sp: (token: SpacingToken) => number;
  touch: (size: number) => number;
};

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height, fontScale: dimFontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // PixelRatio fontScale is the system accessibility scale; window fontScale can lag.
  const fontScale = Math.max(dimFontScale || 1, PixelRatio.getFontScale() || 1);

  return useMemo(() => {
    const metrics = buildResponsiveMetrics(width, height, fontScale);
    return {
      ...metrics,
      insets: {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
      },
      rw: (size, options) => responsiveWidth(size, metrics.width, options),
      rh: (size, options) => responsiveHeight(size, metrics.height, options),
      rf: (size, options) =>
        responsiveFont(size, metrics.width, metrics.fontScale, options),
      rs: (size, options) => responsiveSpacing(size, metrics.width, options),
      ri: (size) => responsiveIconSize(size, metrics.width, metrics.fontScale),
      rr: (size) => responsiveRadius(size, metrics.width),
      sp: (token) => space(token, metrics.width),
      touch: ensureTouchTarget,
    };
  }, [width, height, fontScale, insets.top, insets.bottom, insets.left, insets.right]);
}
