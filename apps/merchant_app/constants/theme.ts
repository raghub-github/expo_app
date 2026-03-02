/**
 * GatiMitra Merchant App — brand, 8px grid, typography.
 * Primary Mint Green, Dark Navy/Blue, White.
 */

import { Platform } from "react-native";

// 8px grid system
export const SCREEN_PADDING = 16;
export const H_PADDING = SCREEN_PADDING; // 16–20px safe from edges
export const CARD_GAP = 14; // 12–16px between cards
export const SECTION_GAP = 24;
export const CARD_PADDING = 16;
export const CARD_RADIUS = 15; // 14–16px
export const BUTTON_RADIUS = 12;

// Header
export const HEADER_HEIGHT = 60; // 56–64px
export const HEADER_RIGHT_EDGE = 20; // min 20px from right for toggle

// Bottom tab bar — for scroll content padding so last item clears nav
export const TAB_BAR_HEIGHT = 62;
export const SCROLL_BOTTOM_SAFE = 18; // breathing space above nav (80–90px total when + TAB_BAR_HEIGHT)

// KPI card fixed height for equal size
export const KPI_CARD_HEIGHT = 128; // Enough for icon, value, title, subtitle without overlap

// Typography
export const FONT_PAGE_TITLE = 19; // 18–20px SemiBold
export const FONT_CARD_NUMBER = 22; // 20–24px Bold
export const FONT_CARD_NUMBER_LARGE = 26; // KPI emphasis
export const FONT_LABEL = 14; // Medium
export const FONT_SECONDARY = 13; // 12–13px Regular

export const GatiMitraMerchant = {
  // Brand — Primary Mint Green, Dark Navy/Blue
  primary: "#3EB489", // Mint green
  primaryLight: "#5DD9A8",
  primaryDark: "#2E9B6E",
  primaryGradient: ["#3EB489", "#2E9B6E"] as const,
  navy: "#1E3A5F", // Dark Navy/Blue
  navyLight: "#2D4A6F",

  // Store status toggle
  storeOnline: "#22C55E",
  storeOnlineBg: "#22C55E",
  storeOffline: "#EF4444",
  storeOfflineBg: "#EF4444", // Soft red, muted via opacity in toggle if needed

  // Surfaces
  background: "#FFFFFF",
  cardBg: "#FFFFFF",
  surfaceWarm: "#F8FAFC",
  surfaceSubtle: "#F1F5F9",

  // Text
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",

  // Border & divider
  border: "#E2E8F0",
  divider: "#E2E8F0",

  // Tab bar
  tabBarBg: "#FFFFFF",
  tabBarBorder: "#E2E8F0",
  tabActive: "#3EB489",
  tabInactive: "#64748B",

  // Semantic
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#0EA5E9",
  // Order status pills — improved contrast
  statusPending: "#92400E",
  statusPendingBg: "#FEF3C7",
  statusPreparing: "#C2410C",
  statusPreparingBg: "#FFEDD5",
  statusCompleted: "#166534",
  statusCompletedBg: "#DCFCE7",

  // Elevation (no overflow, proper shadow)
  shadow: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowSm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shadowCard: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  /** Web: cursor pointer for buttons, toggles, cards. Native: no-op. */
  cursorPointer: Platform.OS === "web" ? { cursor: "pointer" as const } : {},
} as const;
