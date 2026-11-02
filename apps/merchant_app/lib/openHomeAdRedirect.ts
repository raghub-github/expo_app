import { Linking } from "react-native";
import type { Router } from "expo-router";
import { isSafeMerchantPushHref } from "@/lib/merchantNavigation";

/**
 * Normalize admin-entered paths to expo-router hrefs.
 * Examples: /earnings → /(tabs)/earnings · profile/offers → /(tabs)/profile/offers
 */
export function normalizeMerchantAdHref(raw: string): string {
  let p = raw.trim();
  if (!p) return "";
  // Custom scheme → path
  p = p.replace(/^gatimitra:\/\//i, "/").replace(/^merchant:\/\//i, "/");
  if (!p.startsWith("/") && !/^https?:\/\//i.test(p)) p = `/${p}`;

  if (/^https?:\/\//i.test(p)) return p;

  // Bare tab shortcuts
  const bare = p.replace(/^\//, "");
  const tabMap: Record<string, string> = {
    home: "/(tabs)",
    index: "/(tabs)",
    orders: "/(tabs)/orders",
    menu: "/(tabs)/menu",
    catalog: "/(tabs)/menu",
    earnings: "/(tabs)/earnings",
    profile: "/(tabs)/profile",
    growth: "/(tabs)/growth",
    reviews: "/(tabs)/reviews",
    complaints: "/(tabs)/complaints",
  };
  if (tabMap[bare]) return tabMap[bare];

  if (p.startsWith("/(tabs)")) return p;
  if (p.startsWith("/profile/") || p === "/profile") return `/(tabs)${p === "/profile" ? "/profile" : p}`;
  if (p.startsWith("/menu/") || p === "/menu") return `/(tabs)${p}`;
  if (p.startsWith("/orders") || p === "/orders") return `/(tabs)${p.startsWith("/orders") ? p : "/orders"}`;
  if (p.startsWith("/earnings") || p === "/earnings") return `/(tabs)${p}`;
  if (p.startsWith("/growth")) return `/(tabs)${p}`;
  if (
    p.startsWith("/order/") ||
    p.startsWith("/order-history") ||
    p.startsWith("/restaurant-status") ||
    p.startsWith("/order-review/") ||
    p.startsWith("/feedback-reply/")
  ) {
    return p;
  }
  // Unknown in-app-looking path — still try under tabs
  if (p.startsWith("/") && !p.includes("://")) return p.startsWith("/(tabs)") ? p : `/(tabs)${p}`;
  return p;
}

/** Open redirect target inside the app (new screen) or external browser. */
export async function openHomeAdRedirect(rawUrl: string, router: Router): Promise<void> {
  const normalized = normalizeMerchantAdHref(rawUrl);
  if (!normalized) return;

  if (/^https?:\/\//i.test(normalized)) {
    await Linking.openURL(normalized);
    return;
  }

  const href = normalized.startsWith("/") ? normalized : `/${normalized}`;
  // Prefer safe merchant routes; still attempt push for /(tabs)/… shortcuts.
  if (isSafeMerchantPushHref(href) || href.startsWith("/(tabs)") || href.startsWith("/order")) {
    try {
      router.push(href as never);
      return;
    } catch {
      /* fall through */
    }
  }

  // Last resort: try as Linking (custom schemes / https mistaken paths)
  await Linking.openURL(normalized).catch(() => {});
}
