import type { Router } from "expo-router";

export const ORDERS_TAB_FALLBACK = "/(tabs)/orders" as const;
export const HOME_TAB_FALLBACK = "/(tabs)/" as const;
export const PROFILE_TAB_FALLBACK = "/(tabs)/profile" as const;
export const FOOD_HOME_FALLBACK = "/home" as const;
export const RIDE_HOME_FALLBACK = "/home/service/ride" as const;
export const PARCEL_HOME_FALLBACK = "/home/service/parcels" as const;

export type SafeRouterBackFallback =
  | typeof ORDERS_TAB_FALLBACK
  | typeof HOME_TAB_FALLBACK
  | typeof PROFILE_TAB_FALLBACK
  | typeof FOOD_HOME_FALLBACK
  | typeof RIDE_HOME_FALLBACK
  | typeof PARCEL_HOME_FALLBACK
  | "/(auth)/login"
  | "/profile/legal";

/** Screens opened via router.replace often have no stack entry — avoid GO_BACK errors. */
export function safeRouterBack(
  router: Pick<Router, "back" | "canGoBack" | "replace">,
  fallback: SafeRouterBackFallback = ORDERS_TAB_FALLBACK
): void {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

/** Checkout is often opened via replace (payment retry) — fall back to merchant or home tab. */
export function checkoutRouterBack(
  router: Pick<Router, "back" | "canGoBack" | "replace">,
  merchantId?: string | null
): void {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }
  const id = merchantId?.trim();
  if (id) {
    router.replace(`/home/merchant/${id}` as never);
    return;
  }
  router.replace(HOME_TAB_FALLBACK);
}

/** Food listing at /home — return to main tabs (avoid GO_BACK when stack was reset). */
export function foodHomeRouterBack(router: Pick<Router, "replace">): void {
  router.replace(HOME_TAB_FALLBACK);
}

export function resolveAndroidBackFallback(segments: readonly string[]): SafeRouterBackFallback | null {
  const root = segments[0];
  if (root === "orders") {
    const screen = segments[1];
    if (
      screen &&
      screen !== "payment-success" &&
      screen !== "payment-failure" &&
      screen !== "payment-confirming"
    ) {
      return ORDERS_TAB_FALLBACK;
    }
    return null;
  }
  if (root === "checkout") {
    return HOME_TAB_FALLBACK;
  }
  if (root === "home") {
    const section = segments[1];
    if (section === "meals-under-price") {
      return FOOD_HOME_FALLBACK;
    }
    if (section === "merchant" || section === "category" || section === "shop") {
      return FOOD_HOME_FALLBACK;
    }
    if (section === "service") {
      return FOOD_HOME_FALLBACK;
    }
    return HOME_TAB_FALLBACK;
  }
  if (root === "wallet") {
    return PROFILE_TAB_FALLBACK;
  }
  if (root === "profile") {
    const screen = segments[1];
    if (!screen || screen === "index") {
      return FOOD_HOME_FALLBACK;
    }
    return PROFILE_TAB_FALLBACK;
  }
  if (root === "search") {
    return HOME_TAB_FALLBACK;
  }
  return null;
}
