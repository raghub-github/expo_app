/**
 * Canonical Customer App Home service registry.
 * Single source of truth for notification targeting + deep links.
 * Keep in sync with apps/customer_app home service cards (ids + routes).
 */

export type CustomerHomeServiceId =
  | "food"
  | "ride"
  | "parcels"
  | "grocery"
  | "ecom"
  | "near-me";

export type CustomerHomeServiceDef = {
  id: CustomerHomeServiceId;
  label: string;
  /** Expo-router path opened when target_type=SERVICE */
  deepLink: string;
  /** user_app_category.store_type for category targeting; null = categories N/A */
  storeType: string | null;
  /** merchant_stores.store_type values allowed for store targeting */
  storeTypesForStores: string[] | null;
  supportsCategory: boolean;
  supportsStore: boolean;
};

export const CUSTOMER_HOME_SERVICES: readonly CustomerHomeServiceDef[] = [
  {
    id: "food",
    label: "Order Food",
    deepLink: "/home",
    storeType: "FOOD",
    storeTypesForStores: ["FOOD", "RESTAURANT", "CLOUD_KITCHEN"],
    supportsCategory: true,
    supportsStore: true,
  },
  {
    id: "ride",
    label: "Book a Ride",
    deepLink: "/home/service/ride",
    storeType: null,
    storeTypesForStores: null,
    supportsCategory: false,
    supportsStore: false,
  },
  {
    id: "grocery",
    label: "Grocery",
    deepLink: "/home/grocery",
    storeType: "GROCERY",
    storeTypesForStores: ["GROCERY"],
    supportsCategory: true,
    supportsStore: true,
  },
  {
    id: "parcels",
    label: "Courier Service",
    deepLink: "/home/service/parcels",
    storeType: null,
    storeTypesForStores: null,
    supportsCategory: false,
    supportsStore: false,
  },
  {
    id: "ecom",
    label: "E-Commerce",
    deepLink: "/home/shop",
    storeType: null,
    storeTypesForStores: null,
    supportsCategory: false,
    supportsStore: false,
  },
  {
    id: "near-me",
    label: "Explore Nearby",
    deepLink: "/home/service/near-me",
    storeType: null,
    storeTypesForStores: null,
    supportsCategory: false,
    supportsStore: false,
  },
] as const;

export function getCustomerHomeService(
  id: string | null | undefined,
): CustomerHomeServiceDef | null {
  const key = String(id ?? "").trim().toLowerCase();
  return CUSTOMER_HOME_SERVICES.find((s) => s.id === key) ?? null;
}

export const ANNOUNCEMENT_TARGET_TYPES = [
  "NONE",
  "HOME",
  "SERVICE",
  "FOOD_HOME",
  "GROCERY_HOME",
  "RIDES",
  "PARCEL",
  "STORE",
  "RESTAURANT",
  "MENU",
  "PRODUCT",
  "CATEGORY",
  "OFFER",
  "COUPON",
  "ORDER",
  "SUBSCRIPTION",
  "GMITRA_PLUS",
  "CUSTOM_DEEP_LINK",
] as const;

export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

/** Types stored after alias folding. */
export type CanonicalAnnouncementTargetType =
  | "NONE"
  | "HOME"
  | "SERVICE"
  | "CATEGORY"
  | "STORE"
  | "OFFER"
  | "ORDER"
  | "SUBSCRIPTION"
  | "CUSTOM_DEEP_LINK";

const SERVICE_ALIASES: Record<string, CustomerHomeServiceId> = {
  FOOD_HOME: "food",
  GROCERY_HOME: "grocery",
  RIDES: "ride",
  PARCEL: "parcels",
};

const TYPE_ALIASES: Record<string, CanonicalAnnouncementTargetType> = {
  FOOD_HOME: "SERVICE",
  GROCERY_HOME: "SERVICE",
  RIDES: "SERVICE",
  PARCEL: "SERVICE",
  RESTAURANT: "STORE",
  MENU: "STORE",
  PRODUCT: "STORE",
  COUPON: "OFFER",
  GMITRA_PLUS: "SUBSCRIPTION",
};

export const ALLOWED_CUSTOM_DEEP_LINK_PREFIXES = [
  "/home",
  "/offers",
  "/orders",
  "/notifications",
  "/profile",
  "/wallet",
  "/search",
  "/checkout",
  "/group",
  "/support",
  "/location",
] as const;

export function isAllowedGatimitraDeepLink(path: string): boolean {
  const p = String(path ?? "").trim();
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("..")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  if (/\s/.test(p)) return false;
  return ALLOWED_CUSTOM_DEEP_LINK_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`),
  );
}

export type AnnouncementTargetInput = {
  targetType: AnnouncementTargetType | string;
  serviceId?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  customDeepLink?: string | null;
  targetId?: string | null;
};

export type AnnouncementTargetResolved = {
  target_type: CanonicalAnnouncementTargetType;
  target_id: string | null;
  target_service_id: string | null;
  target_category_id: string | null;
  target_store_id: string | null;
  target_payload: Record<string, unknown> | null;
  deepLink: string;
};

function emptyResolved(deepLink: string, type: CanonicalAnnouncementTargetType = "NONE"): AnnouncementTargetResolved {
  return {
    target_type: type,
    target_id: null,
    target_service_id: null,
    target_category_id: null,
    target_store_id: null,
    target_payload: null,
    deepLink,
  };
}

/**
 * Build deep-link + normalized target fields for CUSTOMER_ANNOUNCEMENT.
 * Category filter is navigation context only (query/path) — never a persisted preference.
 */
export function buildAnnouncementDeepLink(
  input: AnnouncementTargetInput,
): AnnouncementTargetResolved {
  const rawType = String(input.targetType || "NONE").trim().toUpperCase();
  const canonical = (TYPE_ALIASES[rawType] ?? rawType) as CanonicalAnnouncementTargetType;
  const targetId = String(input.targetId ?? "").trim() || null;
  const aliasedService = SERVICE_ALIASES[rawType] ?? null;
  const serviceId = aliasedService || input.serviceId;
  const storeId = String(input.storeId ?? targetId ?? "").trim() || null;
  const categoryId = String(input.categoryId ?? (canonical === "CATEGORY" ? targetId : "") ?? "").trim() || null;
  const orderId = String(input.orderId ?? (canonical === "ORDER" ? targetId : "") ?? "").trim() || null;

  if (canonical === "NONE" || !canonical) {
    return emptyResolved("/notifications", "NONE");
  }

  if (canonical === "HOME") {
    return emptyResolved("/home", "HOME");
  }

  if (canonical === "OFFER") {
    return {
      ...emptyResolved("/offers", "OFFER"),
      target_id: targetId,
    };
  }

  if (canonical === "SUBSCRIPTION") {
    return emptyResolved("/profile/subscription", "SUBSCRIPTION");
  }

  if (canonical === "ORDER") {
    if (!orderId) throw new Error("orderId is required for ORDER target");
    return {
      ...emptyResolved(`/orders/${encodeURIComponent(orderId)}`, "ORDER"),
      target_id: orderId,
      target_payload: { orderId },
    };
  }

  if (canonical === "CUSTOM_DEEP_LINK") {
    const path = String(input.customDeepLink ?? targetId ?? "").trim();
    if (!isAllowedGatimitraDeepLink(path)) {
      throw new Error("Custom deep link is not an allowed GatiMitra route");
    }
    return {
      ...emptyResolved(path, "CUSTOM_DEEP_LINK"),
      target_id: path,
      target_payload: { deepLink: path },
    };
  }

  const service = getCustomerHomeService(serviceId);
  if (!service) {
    throw new Error(`Unknown service id: ${serviceId ?? ""}`);
  }

  if (canonical === "SERVICE") {
    return {
      target_type: "SERVICE",
      target_id: service.id,
      target_service_id: service.id,
      target_category_id: null,
      target_store_id: null,
      target_payload: null,
      deepLink: service.deepLink,
    };
  }

  if (canonical === "CATEGORY") {
    if (!service.supportsCategory || !service.storeType) {
      throw new Error(`Service ${service.id} does not support category targeting`);
    }
    if (!categoryId) throw new Error("categoryId is required for CATEGORY target");
    const qs = new URLSearchParams({ storeType: service.storeType });
    return {
      target_type: "CATEGORY",
      target_id: categoryId,
      target_service_id: service.id,
      target_category_id: categoryId,
      target_store_id: null,
      target_payload: { storeType: service.storeType },
      deepLink: `/home/category/${encodeURIComponent(categoryId)}?${qs.toString()}`,
    };
  }

  if (canonical === "STORE") {
    if (!service.supportsStore) {
      throw new Error(`Service ${service.id} does not support store targeting`);
    }
    if (!storeId) throw new Error("storeId is required for STORE target");
    return {
      target_type: "STORE",
      target_id: storeId,
      target_service_id: service.id,
      target_category_id: null,
      target_store_id: storeId,
      target_payload: null,
      deepLink: `/home/merchant/${encodeURIComponent(storeId)}`,
    };
  }

  return emptyResolved("/notifications", "NONE");
}
