/**
 * GatiMitra Rider App - Unified Theme System
 */

export { colors } from "./colors";
export { typography } from "./typography";
export { spacing } from "./spacing";
export * from "./riderAuthTheme";
export type { ColorScheme } from "./colors";
export {
  LAYOUT_BREAKPOINTS,
  MIN_TOUCH_TARGET,
  buildResponsiveMetrics,
  clamp,
  ensureTouchTarget,
  responsiveFont,
  responsiveHeight,
  responsiveIconSize,
  responsiveRadius,
  responsiveSpacing,
  responsiveWidth,
  resolveSizeClass,
  space,
  spacingScale,
} from "./responsive";
export type { LayoutSizeClass, ResponsiveMetrics, SpacingToken } from "./responsive";
export { rowLayout, flexShrinkText, responsiveTextProps, responsiveMultilineProps } from "./responsiveText";



