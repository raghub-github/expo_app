import * as Linking from "expo-linking";

/** Compatible with expo-router typed routes and plain string paths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouterLike = { push: (href: any) => void };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const SERVICE_ROUTES: Record<string, string> = {
  food: "/home",
  ride: "/home/service/ride",
  parcels: "/home/service/parcels",
  grocery: "/home/grocery",
  ecom: "/home/shop",
  "near-me": "/home/service/near-me",
};

const FALLBACK_HREF = "/home";

/**
 * Structured CUSTOMER_ANNOUNCEMENT targets (service / category / store / home / offers…).
 * Category filters are path/query context only — not persisted preferences.
 */
function resolveStructuredAnnouncementHref(data: Record<string, unknown>): string | null {
  const targetType = asString(data.target_type || data.targetType).trim().toUpperCase();
  if (!targetType || targetType === "NONE") return null;
  const serviceId = asString(data.target_service_id || data.targetServiceId).trim().toLowerCase();
  const categoryId = asString(data.target_category_id || data.targetCategoryId).trim();
  const storeId = asString(data.target_store_id || data.targetStoreId || data.target_id).trim();
  const targetId = asString(data.target_id || data.targetId).trim();

  if (targetType === "HOME" || targetType === "FOOD_HOME") return "/home";
  if (targetType === "GROCERY_HOME") return "/home/grocery";
  if (targetType === "RIDES") return "/home/service/ride";
  if (targetType === "PARCEL") return "/home/service/parcels";
  if (targetType === "OFFER" || targetType === "COUPON") return "/offers";
  if (targetType === "SUBSCRIPTION" || targetType === "GMITRA_PLUS") return "/profile/subscription";
  if (targetType === "ORDER") {
    const orderId = asString(data.orderId || data.target_order_id).trim() || targetId;
    return orderId ? `/orders/${encodeURIComponent(orderId)}` : "/orders";
  }
  if (targetType === "CUSTOM_DEEP_LINK") {
    const path = asString(data.customDeepLink || data.custom_deep_link).trim() || targetId;
    if (path.startsWith("/") && !path.startsWith("//") && !path.includes("..")) return path;
    return FALLBACK_HREF;
  }

  if (targetType === "SERVICE" && serviceId) {
    return SERVICE_ROUTES[serviceId] ?? FALLBACK_HREF;
  }
  if (targetType === "CATEGORY" && categoryId) {
    const st = serviceId === "grocery" ? "GROCERY" : "FOOD";
    return `/home/category/${encodeURIComponent(categoryId)}?storeType=${encodeURIComponent(st)}`;
  }
  if (
    (targetType === "STORE" || targetType === "RESTAURANT" || targetType === "MENU" || targetType === "PRODUCT") &&
    storeId
  ) {
    return `/home/merchant/${encodeURIComponent(storeId)}`;
  }
  return null;
}

/**
 * Uses structured announcement targets first, then `screen` / `deepLink`.
 */
export function navigateFromPushData(router: RouterLike, data: Record<string, unknown>): void {
  try {
    const structured = resolveStructuredAnnouncementHref(data);
    if (structured) {
      router.push(structured);
      return;
    }

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
