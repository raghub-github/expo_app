import type { Router } from "expo-router";
import { foodFixDbg, foodNavDbg } from "@/lib/tabNavDebug";
import { navigateToFoodHome } from "@/lib/navigateToFoodHome";

export const ORDERS_TAB_FALLBACK = "/(tabs)/orders" as const;
export const HOME_TAB_FALLBACK = "/(tabs)/" as const;
export const PROFILE_TAB_FALLBACK = "/(tabs)/profile" as const;
/** Sentinel for "open Food listing" — implemented as the Food TAB, never stack `/home`. */
export const FOOD_HOME_FALLBACK = "/(tabs)/food" as const;
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

function applyFallback(
  router: Pick<Router, "back" | "canGoBack" | "replace">,
  fallback: SafeRouterBackFallback,
  source: string
): void {
  if (fallback === FOOD_HOME_FALLBACK) {
    foodFixDbg("NAVIGATE food", {
      source,
      method: "navigateToFoodHome",
      target: "food",
      reason: "food-listing-fallback",
    });
    // Overlay (merchant/category/tracking) may still be on top of tabs.
    // Collapse it when possible, then select the Food TAB — never push `/home`.
    navigateToFoodHome(router as Router, { fromOverlay: true });
    return;
  }
  router.replace(fallback);
}

export function applySafeBackFallback(
  router: Pick<Router, "back" | "canGoBack" | "replace">,
  fallback: SafeRouterBackFallback,
  source = "applySafeBackFallback"
): void {
  applyFallback(router, fallback, source);
}

/** Screens opened via router.replace often have no stack entry — avoid GO_BACK errors. */
export function safeRouterBack(
  router: Pick<Router, "back" | "canGoBack" | "replace">,
  fallback: SafeRouterBackFallback = ORDERS_TAB_FALLBACK
): void {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }
  applyFallback(router, fallback, "safeRouterBack");
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

/**
 * Leaving a leftover stack Food listing (`/home`). Prefer pop; otherwise Home tab.
 * Primary Food lives at `/(tabs)/food` — do not replace onto `/home`.
 */
export function foodHomeRouterBack(
  router: Pick<Router, "back" | "canGoBack" | "replace">
): void {
  const canGo = typeof router.canGoBack === "function" ? router.canGoBack() : false;
  foodFixDbg("LEAVE food", {
    source: "foodHomeRouterBack",
    method: canGo ? "router.back" : "router.replace",
    target: canGo ? "(stack-pop)" : "index",
    reason: "explicit-food-listing-back",
    canGoBack: canGo,
  });
  foodNavDbg("LEAVE", {
    source: "foodHomeRouterBack",
    method: canGo ? "router.back" : "router.replace",
    to: canGo ? "(stack-pop)" : HOME_TAB_FALLBACK,
    reason: "food-listing-back",
    canGoBack: canGo,
  });
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }
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
    if (section === "meals-under-price" || section === "free-packaging" || section === "crazy-deals") {
      return FOOD_HOME_FALLBACK;
    }
    if (section === "merchant" || section === "category") {
      return FOOD_HOME_FALLBACK;
    }
    if (section === "shop") {
      return HOME_TAB_FALLBACK;
    }
    if (section === "service") {
      const slug = segments[2] ?? "";
      if (slug.startsWith("ride")) return RIDE_HOME_FALLBACK;
      if (slug.startsWith("parcel")) return PARCEL_HOME_FALLBACK;
      return HOME_TAB_FALLBACK;
    }
    return HOME_TAB_FALLBACK;
  }
  if (root === "wallet") {
    return PROFILE_TAB_FALLBACK;
  }
  if (root === "profile") {
    const screen = segments[1];
    if (!screen || screen === "index") {
      return PROFILE_TAB_FALLBACK;
    }
    return PROFILE_TAB_FALLBACK;
  }
  if (root === "search") {
    return HOME_TAB_FALLBACK;
  }
  return null;
}
