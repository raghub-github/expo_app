/**
 * Typography system for GatiMitra Rider App
 */

import { Platform } from "react-native";

export const typography = {
  fontFamily: {
    regular: Platform.select({
      ios: "System",
      android: "Roboto",
      default: "System",
    }),
    medium: Platform.select({
      ios: "System",
      android: "Roboto-Medium",
      default: "System",
    }),
    bold: Platform.select({
      ios: "System",
      android: "Roboto-Bold",
      default: "System",
    }),
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const;



