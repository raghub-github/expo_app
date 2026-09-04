/**
 * Canonical Customer App Home service registry (dashboard copy).
 * Keep in sync with backend/src/lib/customer-home-services.ts
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
  deepLink: string;
  storeType: string | null;
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

export type AnnouncementTargetType = "NONE" | "SERVICE" | "CATEGORY" | "STORE";

export type AnnouncementTargetInput = {
  targetType: AnnouncementTargetType;
  serviceId?: string | null;
  categoryId?: string | null;
  storeId?: string | null;
};

export type AnnouncementTargetResolved = {
  target_type: AnnouncementTargetType;
  target_service_id: string | null;
  target_category_id: string | null;
  target_store_id: string | null;
  deepLink: string;
};

export function buildAnnouncementDeepLink(
  input: AnnouncementTargetInput,
): AnnouncementTargetResolved {
  const type = (input.targetType || "NONE").toUpperCase() as AnnouncementTargetType;
  if (type === "NONE" || !type) {
    return {
      target_type: "NONE",
      target_service_id: null,
      target_category_id: null,
      target_store_id: null,
      deepLink: "/notifications",
    };
  }

  const service = getCustomerHomeService(input.serviceId);
  if (!service) {
    throw new Error(`Unknown service id: ${input.serviceId ?? ""}`);
  }

  if (type === "SERVICE") {
    return {
      target_type: "SERVICE",
      target_service_id: service.id,
      target_category_id: null,
      target_store_id: null,
      deepLink: service.deepLink,
    };
  }

  if (type === "CATEGORY") {
    if (!service.supportsCategory || !service.storeType) {
      throw new Error(`Service ${service.id} does not support category targeting`);
    }
    const categoryId = String(input.categoryId ?? "").trim();
    if (!categoryId) throw new Error("categoryId is required for CATEGORY target");
    const qs = new URLSearchParams({ storeType: service.storeType });
    return {
      target_type: "CATEGORY",
      target_service_id: service.id,
      target_category_id: categoryId,
      target_store_id: null,
      deepLink: `/home/category/${encodeURIComponent(categoryId)}?${qs.toString()}`,
    };
  }

  if (type === "STORE") {
    if (!service.supportsStore) {
      throw new Error(`Service ${service.id} does not support store targeting`);
    }
    const storeId = String(input.storeId ?? "").trim();
    if (!storeId) throw new Error("storeId is required for STORE target");
    return {
      target_type: "STORE",
      target_service_id: service.id,
      target_category_id: null,
      target_store_id: storeId,
      deepLink: `/home/merchant/${encodeURIComponent(storeId)}`,
    };
  }

  return {
    target_type: "NONE",
    target_service_id: null,
    target_category_id: null,
    target_store_id: null,
    deepLink: "/notifications",
  };
}
