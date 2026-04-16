import * as Linking from "expo-linking";

/** Compatible with expo-router typed routes and plain string paths. */
export type RouterLike = { push: (href: unknown) => void };

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

    const deepLink = asString(data.deepLink).trim();
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
      router.push(`/order/${String(data.orderId)}`);
      return;
    }

    if (asString(data.action) === "open_notifications") {
      router.push("/notifications");
    }
  } catch {
    // Never crash the app on malformed deep links.
  }
}
