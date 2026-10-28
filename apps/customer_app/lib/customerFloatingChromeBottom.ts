/**
 * Pure bottom-Y helper for floating tab capsule + Track/cart dock.
 * Kept free of react-native imports so unit tests can run under node:test.
 *
 * Must stay in sync with `resolveCustomerFloatingChromeBottom` in constants/layout.ts
 * (that wrapper adds Android nav-floor via resolveTabBarBottomInset).
 */

export const CUSTOMER_TAB_BAR_FLOAT_GAP_PURE = 0;

/** Mirrors layout DEFAULT_ANDROID_NAV_BOTTOM_INSET for Android floor tests. */
export const DEFAULT_ANDROID_NAV_BOTTOM_INSET_PURE = 24;

export function resolveTabBarBottomInsetPure(
  insetsBottom: number,
  platform: "ios" | "android" | "web" = "android",
  /** When true, activity window already sits above system nav (non edge-to-edge). */
  windowClearsSystemNav = false
): number {
  const inset = Math.max(0, insetsBottom);
  if (platform === "android") {
    if (windowClearsSystemNav) return 0;
    return inset > 0 ? inset : DEFAULT_ANDROID_NAV_BOTTOM_INSET_PURE;
  }
  return Math.max(inset, 8);
}

/**
 * Shared chrome inset under the tab row (sheet is screen-connected at bottom: 0).
 */
export function resolveCustomerFloatingChromeBottomPure(
  rawBottom: number,
  platform: "ios" | "android" | "web" = "android",
  windowClearsSystemNav = false
): number {
  return (
    resolveTabBarBottomInsetPure(rawBottom, platform, windowClearsSystemNav) +
    CUSTOMER_TAB_BAR_FLOAT_GAP_PURE
  );
}
