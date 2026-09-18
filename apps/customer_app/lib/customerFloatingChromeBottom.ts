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
  platform: "ios" | "android" | "web" = "android"
): number {
  const inset = Math.max(0, insetsBottom);
  if (platform === "android") {
    return Math.max(DEFAULT_ANDROID_NAV_BOTTOM_INSET_PURE, inset);
  }
  return Math.max(inset, 8);
}

/**
 * Shared chrome Y: tab sheet + Track/cart dock.
 * Sheet is screen-connected (bottom: 0); this is the inset under the tab row
 * so icons stay above the Android gesture / home indicator.
 */
export function resolveCustomerFloatingChromeBottomPure(
  rawBottom: number,
  platform: "ios" | "android" | "web" = "android"
): number {
  return resolveTabBarBottomInsetPure(rawBottom, platform);
}
