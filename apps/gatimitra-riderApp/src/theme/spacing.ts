/**
 * Spacing system (consistent with Tailwind) + semantic aliases.
 * Prefer `spacing.xs`…`spacing.xl` or `useResponsiveLayout().sp()` for new UI.
 */

import { spacingScale } from "./responsive";

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  /** Semantic tokens (same values as spacingScale). */
  xs: spacingScale.xs,
  sm: spacingScale.sm,
  md: spacingScale.md,
  lg: spacingScale.lg,
  xl: spacingScale.xl,
  "2xl": spacingScale["2xl"],
  "3xl": spacingScale["3xl"],
  "4xl": spacingScale["4xl"],
} as const;



