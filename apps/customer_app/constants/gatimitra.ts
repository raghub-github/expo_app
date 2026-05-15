/**
 * GatiMitra brand colors and theme for ride booking and mobility UI.
 * Primary: Mint Green Gradient (restaurant/delivery UI)
 * Secondary: Emerald → Orange for CTAs
 * Background: Soft Warm Gray / Pure White
 *
 * 2025 Visual Language (NEW):
 * Primary Mint #22C55E, Deep Mint Gradient #16A34A → #34D399,
 * Soft Background #F8FAF9, Text Primary #111827, Card Surface #FFFFFF.
 */

export const GatiMitraColors = {
  // 2025 Primary Mint (NEW)
  primaryMint: "#22C55E",
  /**
   * Splash / bootstrap — teal-mint (blue-green). `primaryMint` reads lime on screen; use this for first paint.
   */
  splashMint: "#14b8a6",
  deepMintStart: "#16A34A",
  deepMintEnd: "#34D399",
  deepMintGradient: ["#16A34A", "#34D399"] as const,

  // Mint Green Gradient (primary for restaurant detail, buttons)
  mintStart: "#1FBF8F",
  mintEnd: "#4ADE80",
  mintGradient: ["#1FBF8F", "#4ADE80"] as const,

  // Primary (Emerald → Orange)
  emerald: "#059669",
  emeraldLight: "#10b981",
  warmOrange: "#f97316",
  warmOrangeLight: "#fb923c",

  // Gradient arrays for LinearGradient
  primaryGradient: ["#059669", "#10b981", "#f97316"] as const,
  primaryGradientShort: ["#059669", "#f97316"] as const,
  ctaGradient: ["#1FBF8F", "#4ADE80"] as const,
  ctaGradientEmerald: ["#059669", "#0d9488", "#f97316"] as const,

  // Closed state (store unavailable)
  closedRed: "#FF4D4F",

  // Accent
  mint: "#a7f3d0",
  mintSoft: "#d1fae5",
  mintHighlight: "#6ee7b7",

  // 2025 Surfaces (NEW)
  softBackground: "#F8FAF9",
  textPrimaryNew: "#111827",
  cardSurface: "#FFFFFF",

  // Soft warm gray (backgrounds)
  surfaceWarm: "#F5F7FA",
  cardBgWarm: "#FAFAF9",

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
  /** 2025 Floating header glassmorphism */
  headerGlass: {
    backgroundColor: "rgba(255,255,255,0.85)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 8,
  },
  /** 2025 Category card elevated */
  categoryCardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  /** 2025 Restaurant card premium */
  restaurantCardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 6,
  },
  /** Checkout & Place Order — primary gradient (Swiggy/Zomato-level CTA) */
  checkoutGradient: ["#20C997", "#28A745"] as const,
  /** Warning — distance / validation (soft amber) */
  warningAmber: "#F59E0B",
  warningAmberBg: "#FEF3C7",
  /** Error — critical only */
  errorRed: "#DC2626",
} as const;
