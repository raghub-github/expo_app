import { Platform } from "react-native";

/**
 * Global layout constants for status bar and header spacing.
 * Use these so all screens have consistent status bar visibility and no extra gaps.
 *
 * Rule: Root layout reserves status bar space (a colored strip) for all stacks
 * except profile (which uses native header with headerStatusBarHeight).
 * Screens under root should NOT add paddingTop for the status bar—only use
 * insets.top when the screen is the only one providing safe area (e.g. profile tab
 * content when root spacer is still applied).
 */

/** Default status bar height when insets are not yet available (e.g. 24dp Android). */
export const DEFAULT_STATUS_BAR_HEIGHT = 24;

/**
 * Top safe inset that never collapses to 0 on Android (avoids content falling
 * under the status bar while SafeAreaProvider is still settling).
 */
export function resolveTopSafeInset(insetsTop: number): number {
  if (insetsTop > 0) return insetsTop;
  return DEFAULT_STATUS_BAR_HEIGHT;
}

/** Fallback when Android edge-to-edge reports 0 but 3-button nav is present. */
export const ANDROID_FALLBACK_BOTTOM_INSET = 48;

/** Matches Android system navigation bar — tab bar inset area uses same color. */
export const ANDROID_SYSTEM_NAV_COLOR = "#121212";

/** Bottom safe inset for scroll content / floating UI (not tab bar chrome). */
export function resolveBottomSafeInset(insetsBottom: number): number {
  if (Platform.OS !== "android") return insetsBottom;
  if (insetsBottom >= 16) return insetsBottom;
  return ANDROID_FALLBACK_BOTTOM_INSET;
}

/** Bottom inset for tab / ride nav — OS value only (no extra in-app black strip). */
export function resolveTabBarBottomInset(insetsBottom: number): number {
  if (Platform.OS !== "android") return insetsBottom;
  return Math.max(0, insetsBottom);
}

/** Bar padding + tab minHeight + bar padding — keep in sync with bottom nav chrome. */
export const CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT = 8 + 48 + 4;

/** Total bottom nav height including system-nav inset (tab bar + ride service nav). */
export function resolveCustomerBottomNavHeight(rawBottomInset: number): number {
  return CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT + resolveTabBarBottomInset(rawBottomInset);
}

/** Screens that position their own bottom chrome — no stack paddingBottom (avoids double bottom gap). */
export function screenManagesBottomNav(segments: readonly string[]): boolean {
  // Always true: Android system nav is `relative` (CustomerSystemChrome), so the OS
  // already reserves nav height. Stack `paddingBottom` painted a white strip above it
  // on every screen (search, wallet, location, …). Screens that need scroll clearance
  // apply insets.bottom themselves.
  void segments;
  return true;
}

/** Extra lift for floating cart on food browse / merchant menu (above system nav). */
export const FLOATING_CART_UI_LIFT = 20;

/** Full floating cart bar height (padding + thumb row). Keep in sync with GlobalFloatingCart `gmBar`. */
export const FLOATING_CART_BAR_HEIGHT = 64;

/** Extra height when the "All carts" tab sits above the bar. */
export const FLOATING_CART_ALL_CARTS_TAB_HEIGHT = 36;

/** Minimum gap between Change Location CTA and the floating cart top edge. */
export const FLOATING_CART_ABOVE_CTA_GAP = 16;

/** @deprecated Use `FLOATING_CART_UI_LIFT` — kept for merchant menu FAB call sites. */
export const MERCHANT_FLOATING_UI_LIFT = FLOATING_CART_UI_LIFT;

/** Floating cart / dock — no artificial 48dp gap on Android. */
export function resolveFloatingCartBottomOffset(
  rawBottom: number,
  options?: { aboveTabBar?: boolean; tabBarOffset?: number }
): number {
  const navInset = resolveTabBarBottomInset(rawBottom);
  if (options?.aboveTabBar && options.tabBarOffset != null) {
    return options.tabBarOffset + (Platform.OS === "android" ? 4 : 10);
  }
  return Platform.OS === "android" ? navInset : navInset + 10;
}

/** Total bottom reserve for the floating cart pill (offset from screen bottom + bar height). */
export function resolveFloatingCartReserveHeight(options: {
  rawBottomInset: number;
  aboveTabBar?: boolean;
  tabBarOffset?: number;
  /** Worst-case: include the "All carts" tab strip above the bar. */
  withAllCartsTab?: boolean;
  foodServiceLift?: boolean;
}): number {
  const bottomOffset =
    resolveFloatingCartBottomOffset(options.rawBottomInset, {
      aboveTabBar: options.aboveTabBar,
      tabBarOffset: options.tabBarOffset,
    }) + (options.foodServiceLift === false ? 0 : FLOATING_CART_UI_LIFT);
  const barHeight =
    FLOATING_CART_BAR_HEIGHT +
    (options.withAllCartsTab ? FLOATING_CART_ALL_CARTS_TAB_HEIGHT : 0);
  return bottomOffset + barHeight;
}

/**
 * Bottom inset for the no-service "Change Location" CTA so it never overlaps the floating cart.
 */
export function resolveChangeLocationCtaBottom(options: {
  rawBottomInset: number;
  /** When false, only clears the home-indicator / nav inset. */
  reserveFloatingCart?: boolean;
  aboveTabBar?: boolean;
  tabBarOffset?: number;
  withAllCartsTab?: boolean;
  gap?: number;
}): number {
  const gap = options.gap ?? FLOATING_CART_ABOVE_CTA_GAP;
  if (options.reserveFloatingCart === false) {
    return Math.max(options.rawBottomInset, 12) + 20;
  }
  return (
    resolveFloatingCartReserveHeight({
      rawBottomInset: options.rawBottomInset,
      aboveTabBar: options.aboveTabBar,
      tabBarOffset: options.tabBarOffset,
      withAllCartsTab: options.withAllCartsTab ?? true,
      foodServiceLift: true,
    }) + gap
  );
}

/** Minimal vertical padding between status bar and header content when no root spacer (0 = compact). */
export const HEADER_TOP_PADDING_NONE = 0;

/** Use for header row padding (vertical) for readability only—no status bar compensation. */
export const HEADER_VERTICAL_PADDING = 12;

/**
 * Standard gap between status bar and header content.
 * Root layout already renders a status bar strip, so headers must use 0 here to avoid double spacing.
 * Reference: Home Page (tabs/index) uses no extra top padding; header starts immediately below the strip.
 */
export const HEADER_PADDING_TOP = 0;

/** Gap below root status-bar strip before screen header content (root already reserves insets.top). */
export const STATUS_BAR_TO_HEADER_GAP = 2;
