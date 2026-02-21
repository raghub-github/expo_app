/**
 * GatiMitra brand colors and theme for ride booking and mobility UI.
 * Primary: Emerald Green → Warm Orange gradient
 * Accent: Soft Mint Green
 * Background: Pure White
 */

export const GatiMitraColors = {
  // Primary gradient (Emerald → Orange)
  emerald: "#059669",
  emeraldLight: "#10b981",
  warmOrange: "#f97316",
  warmOrangeLight: "#fb923c",

  // Gradient arrays for LinearGradient
  primaryGradient: ["#059669", "#10b981", "#f97316"] as const,
  primaryGradientShort: ["#059669", "#f97316"] as const,
  ctaGradient: ["#059669", "#0d9488", "#f97316"] as const,

  // Accent
  mint: "#a7f3d0",
  mintSoft: "#d1fae5",
  mintHighlight: "#6ee7b7",

  // Surfaces
  background: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardShadow: "rgba(0,0,0,0.06)",

  // Text
  textPrimary: "#1A1A1A",
  textSecondary: "#6B7280",
  textOnGradient: "#FFFFFF",

  // Border & elevation
  border: "#E5E7EB",
  elevationShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  searchShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardShadowSoft: {
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
