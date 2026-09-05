/**
 * Centralized notification deep-link resolver for Customer App.
 * Prefer structured target_* fields; fall back to legacy deepLink/screen paths.
 * Category filters are navigation context only (query/path) — never persisted prefs.
 */

import {
  CUSTOMER_HOME_SERVICE_META,
  type CustomerHomeServiceId,
} from "@/lib/customerHomeServiceMeta";

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

const SERVICE_ROUTES: Record<string, string> = {
  food: "/home",
  ride: "/home/service/ride",
  parcels: "/home/service/parcels",
  grocery: "/home/grocery",
  ecom: "/home/shop",
  "near-me": "/home/service/near-me",
  vouchers: "/home",
};

function storeTypeForService(serviceId: string): string | null {
  if (serviceId === "food") return "FOOD";
  if (serviceId === "grocery") return "GROCERY";
  return null;
}

/**
 * Resolve a single expo-router href from push / inbox payload data.
 * Returns null when no structured or path deep link is present.
 */
export function resolveNotificationDeepLink(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data || typeof data !== "object") return null;

  const targetType = asString(data.target_type || data.targetType).toUpperCase();
  const serviceId = asString(data.target_service_id || data.targetServiceId).toLowerCase();
  const categoryId = asString(data.target_category_id || data.targetCategoryId);
  const storeId = asString(data.target_store_id || data.targetStoreId || data.target_id);
  const targetId = asString(data.target_id || data.targetId);

  if (targetType === "HOME" || targetType === "FOOD_HOME") return "/home";
  if (targetType === "GROCERY_HOME") return "/home/grocery";
  if (targetType === "RIDES") return "/home/service/ride";
  if (targetType === "PARCEL") return "/home/service/parcels";
  if (targetType === "OFFER" || targetType === "COUPON") return "/offers";
  if (targetType === "SUBSCRIPTION" || targetType === "GMITRA_PLUS") return "/profile/subscription";
  if (targetType === "ORDER") {
    const orderId = asString(data.orderId || data.target_order_id) || targetId;
    return orderId ? `/orders/${encodeURIComponent(orderId)}` : "/orders";
  }
  if (targetType === "CUSTOM_DEEP_LINK") {
    const path = asString(data.customDeepLink || data.custom_deep_link) || targetId;
    if (path.startsWith("/") && !path.startsWith("//") && !path.includes("..")) return path;
    return "/home";
  }

  if (targetType === "SERVICE" && serviceId) {
    return SERVICE_ROUTES[serviceId] ?? "/home";
  }

  if (targetType === "CATEGORY" && categoryId) {
    const st = storeTypeForService(serviceId) || "FOOD";
    return `/home/category/${encodeURIComponent(categoryId)}?storeType=${encodeURIComponent(st)}`;
  }

  if (
    (targetType === "STORE" || targetType === "RESTAURANT" || targetType === "MENU" || targetType === "PRODUCT") &&
    storeId
  ) {
    return `/home/merchant/${encodeURIComponent(storeId)}`;
  }

  const screen = asString(data.screen);
  if (screen.startsWith("/")) return screen;

  const deepLink =
    asString(data.deepLink) || asString(data.deep_link) || asString(data.url);
  if (deepLink.startsWith("/")) return deepLink;

  return null;
}

/** Soft labels for debugging / rich modal subtitle — not required for nav. */
export function announcementServiceLabel(serviceId: string): string {
  const id = serviceId as CustomerHomeServiceId;
  return CUSTOMER_HOME_SERVICE_META[id]?.label ?? serviceId;
}
