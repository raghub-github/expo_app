import * as Linking from "expo-linking";

/** Compatible with expo-router typed routes and plain string paths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouterLike = { push: (href: any) => void };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Uses `screen` (expo-router path), then `deepLink` (opens URL or pushes if path-only).
 */
export function navigateFromPushData(router: RouterLike, data: Record<string, unknown>): void {
  try {
    const screen = asString(data.screen).trim();
    if (screen) {
      const normalized = screen.startsWith("/") ? screen : `/${screen}`;
      router.push(normalized);
      return;
    }

    const deepLink =
      asString(data.deepLink).trim() || asString(data.deep_link).trim();
    if (deepLink) {
      if (deepLink.startsWith("/")) {
        router.push(deepLink);
        return;
      }
      void Linking.openURL(deepLink).catch(() => {});
      return;
    }

    const url = asString(data.url).trim();
    if (url) {
      router.push(url);
      return;
    }

    if (data.orderId != null) {
      // Customer app uses /orders/[id]; merchant/rider may remap via onNotificationOpen.
      const orderPath =
        asString(data.orderPath).trim() ||
        (asString(data.appRole) === "merchant" || asString(data.appRole) === "rider"
          ? `/order/${String(data.orderId)}`
          : `/orders/${String(data.orderId)}`);
      router.push(orderPath);
      return;
    }

    if (asString(data.action) === "open_notifications") {
      router.push("/notifications");
    }
  } catch {
    // Never crash the app on malformed deep links.
  }
}
