import { Appearance, Platform } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";

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
 * Gesture-nav / home-indicator reserve on Android while WindowInsets are still 0.
 * Avoids the first-entry tab bar sitting on the system line, then jumping up.
 */
export const DEFAULT_ANDROID_NAV_BOTTOM_INSET = 24;

/**
 * Top safe inset that never collapses to 0 on Android (avoids content falling
 * under the status bar while SafeAreaProvider is still settling).
 */
export function resolveTopSafeInset(insetsTop: number): number {
  if (insetsTop > 0) return insetsTop;
  return DEFAULT_STATUS_BAR_HEIGHT;
}

/**
 * Bottom inset that never collapses to 0 on the first Android frame.
 * `live` is SafeAreaInsets.bottom; `seed` is initialWindowMetrics when available.
 */
export function resolveStableBottomInset(liveBottom: number, seedBottom = 0): number {
  const n = Math.max(0, liveBottom, seedBottom);
  if (n > 0) return n;
  if (Platform.OS === "android") return DEFAULT_ANDROID_NAV_BOTTOM_INSET;
  return 0;
}

/** @deprecated Brand mint — do not use for system navigation bar. */
export const CUSTOMER_SYSTEM_NAV_MINT = GatiMitraColors.splashMint;

/** @deprecated Use resolveAndroidSystemNavBackground() */
export const ANDROID_SYSTEM_NAV_COLOR = CUSTOMER_SYSTEM_NAV_MINT;

/**
 * Android 3-button / gesture nav bar fill — follows the device light/dark theme
 * (not brand mint). Light → white; dark → near-black.
 */
export function resolveAndroidSystemNavBackground(
  colorScheme?: "light" | "dark" | null
): string {
  const scheme = colorScheme ?? Appearance.getColorScheme();
  return scheme === "dark" ? "#000000" : "#FFFFFF";
}

/** Icon/button style for the Android nav bar under the current theme. */
export function resolveAndroidSystemNavButtonStyle(
  colorScheme?: "light" | "dark" | null
): "light" | "dark" {
  const scheme = colorScheme ?? Appearance.getColorScheme();
  return scheme === "dark" ? "light" : "dark";
}

/**
 * Bottom safe inset for scroll content / floating UI.
 * Uses OS-reported inset only — no artificial 48dp strip on gesture navigation.
 */
export function resolveBottomSafeInset(insetsBottom: number): number {
  if (Platform.OS !== "android") return insetsBottom;
  return Math.max(0, insetsBottom);
}

/** Outer paddingTop + capsule — keep in sync with CustomerTabBar (8 + 64). */
export const CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT = 8 + 64;

/** Shared outer capsule radius — identical on Home / Food / Orders / Profile. */
export const FLOATING_NAV_RADIUS = 20;

/** Active tab indicator radius — one token for all four tabs (Android needs this on the same style as bg). */
export const ACTIVE_TAB_RADIUS = 16;

/** Small air under the floating capsule above the system gesture / nav buttons. */
export const CUSTOMER_TAB_BAR_FLOAT_GAP = 8;

/** Bottom inset for tab / ride nav — never collapse under Android system chrome. */
export function resolveTabBarBottomInset(insetsBottom: number): number {
  const inset = resolveBottomSafeInset(insetsBottom);
  if (Platform.OS === "android") {
    return Math.max(DEFAULT_ANDROID_NAV_BOTTOM_INSET, inset);
  }
  return Math.max(inset, 8);
}

/** Total bottom nav height including system-nav inset (tab bar + ride service nav). */
export function resolveCustomerBottomNavHeight(rawBottomInset: number): number {
  return (
    CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT +
    resolveTabBarBottomInset(rawBottomInset) +
    CUSTOMER_TAB_BAR_FLOAT_GAP
  );
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

/**
 * On Courier home, float the track pill above the prohibited-items + T&Cs footer row
 * (2× ~18px lines + gaps + footer padding).
 */
export const PARCEL_TRACK_ABOVE_LEGAL_LIFT = 56;

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
    // Sit clearly above the floating tab capsule (not tucked under it).
    return options.tabBarOffset + (Platform.OS === "android" ? 10 : 12);
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
export const STATUS_BAR_TO_HEADER_GAP = 8;

/** Tabs Home only — breathing room under status icons (must stay ≥0; never overlap). */
export const HOME_HEADER_BELOW_STATUS_GAP = 0;

/** Reserved weather-chip block on tabs Home — must match HomeWeatherBanner shell. */
export const HOME_WEATHER_BANNER_H = 56;
