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

// Safe area — minimum top padding so status bar is always visible on all devices
export const SAFE_AREA_TOP_MIN = 10;

// Header
export const HEADER_HEIGHT = 60; // 56–64px
export const HEADER_RIGHT_EDGE = 20; // min 20px from right for toggle

// Bottom tab bar — height of chrome inside the tab slot (navigator reserves this space).
export const TAB_BAR_HEIGHT = 50;
/** Space between pill row and bottom of tab slot (above home indicator). */
export const TAB_BAR_FLOATING_GAP = 10;

/**
 * Padding for ScrollView/FlatList `contentContainerStyle` inside `(tabs)` routes.
 * The tab bar is laid out below the scene (not over it), so this is only breathing room
 * above the bar — not the full bar height.
 */
export const TAB_BAR_SCROLL_CONTENT_PADDING = 24;

/** Tab screens that need more room above the bar (e.g. earnings ledger). */
export const TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE =
  TAB_BAR_SCROLL_CONTENT_PADDING + 20;

/** @deprecated Use TAB_BAR_SCROLL_CONTENT_PADDING for tab screens. Kept for gradual migration. */
export const SCROLL_BOTTOM_SAFE = 18;

// KPI card fixed height for equal size
export const KPI_CARD_HEIGHT = 128; // Enough for icon, value, title, subtitle without overlap

// Typography
export const FONT_PAGE_TITLE = 19; // 18–20px SemiBold
export const FONT_CARD_NUMBER = 22; // 20–24px Bold
export const FONT_CARD_NUMBER_LARGE = 26; // KPI emphasis
export const FONT_LABEL = 14; // Medium
export const FONT_SECONDARY = 13; // 12–13px Regular

/** Lora = alphabetic UI copy; Poppins = digits / ₹ / % (via AppText + global Text patch). */
export { MerchantFonts } from "@/constants/typography";
export const FONT_LORA = "Lora_400Regular";
export const FONT_LORA_BOLD = "Lora_700Bold";
export const FONT_POPPINS = "Poppins_600SemiBold";
export const FONT_POPPINS_BOLD = "Poppins_700Bold";

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

  // Elevation — native uses shadow* / elevation; web uses boxShadow (RN Web deprecation).
  shadow: Platform.select({
    web: { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" },
    default: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
  }) as object,
  shadowSm: Platform.select({
    web: { boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)" },
    default: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
  }) as object,
  shadowCard: Platform.select({
    web: { boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)" },
    default: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
  }) as object,

  /** Web: cursor pointer for buttons, toggles, cards. Native: no-op. */
  cursorPointer: Platform.OS === "web" ? { cursor: "pointer" as const } : {},
} as const;
