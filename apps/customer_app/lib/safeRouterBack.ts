import type { Router } from "expo-router";

export const ORDERS_TAB_FALLBACK = "/(tabs)/orders" as const;
export const HOME_TAB_FALLBACK = "/(tabs)/" as const;
export const RIDE_HOME_FALLBACK = "/home/service/ride" as const;

export type SafeRouterBackFallback =
  | typeof ORDERS_TAB_FALLBACK
  | typeof HOME_TAB_FALLBACK
  | typeof RIDE_HOME_FALLBACK;

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
  return null;
}
