/**
 * Client-safe path-to-dashboard mapping.
 * Used by both the permission engine (server) and usePermission hook (client)
 * so route protection and UI checks stay in sync without importing server-only code.
 */

import type { DashboardType } from "@/lib/db/schema";

export const PATH_TO_DASHBOARD_MAP: Record<string, DashboardType> = {
  "/dashboard/riders": "RIDER",
  "/dashboard/merchants": "MERCHANT",
  "/dashboard/customers": "CUSTOMER",
  "/dashboard/orders": "ORDER_FOOD",
  "/dashboard/orders/food": "ORDER_FOOD",
  "/dashboard/orders/person-ride": "ORDER_PERSON_RIDE",
  "/dashboard/orders/parcel": "ORDER_PARCEL",
  "/dashboard/tickets": "TICKET",
  "/dashboard/offers": "OFFER",
  "/dashboard/area-managers": "AREA_MANAGER",
  "/dashboard/area-managers/stores": "AREA_MANAGER",
  "/dashboard/area-managers/riders": "AREA_MANAGER",
  "/dashboard/area-managers/availability": "AREA_MANAGER",
  "/dashboard/area-managers/activity-logs": "AREA_MANAGER",
  "/dashboard/merchants/verifications": "MERCHANT",
  "/dashboard/merchants/order-overview": "MERCHANT",
  "/dashboard/merchants/settings": "MERCHANT",
  "/dashboard/merchants/stores": "MERCHANT",
  "/dashboard/payments": "PAYMENT",
  "/dashboard/system": "SYSTEM",
  "/dashboard/analytics": "ANALYTICS",
  "/dashboard/super-admin": "SYSTEM",
};

/**
 * Map URL path to dashboard type. Safe to use on client and server.
 */
export function getDashboardTypeFromPath(pagePath: string): DashboardType | null {
  const trimmed = pagePath.replace(/\/$/, "") || "/dashboard";
  if (PATH_TO_DASHBOARD_MAP[trimmed]) {
    return PATH_TO_DASHBOARD_MAP[trimmed];
  }
  const sorted = Object.entries(PATH_TO_DASHBOARD_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [path, dashboardType] of sorted) {
    if (trimmed.startsWith(path)) {
      return dashboardType;
    }
  }
  return null;
}
