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
 * Paths open to any authenticated agent with ≥1 dashboard (same rule as Home).
 * Exact matches only — do not use a `/dashboard` prefix check (would open every page).
 */
export function isOpenDashboardPath(pagePath: string): boolean {
  const trimmed = pagePath.replace(/\/$/, "") || "/dashboard";
  if (trimmed === "/dashboard") return true;
  if (
    trimmed === "/dashboard/rx" ||
    trimmed.startsWith("/dashboard/rx/") ||
    trimmed === "/dashboard/geo-rider-availability" ||
    trimmed.startsWith("/dashboard/geo-rider-availability/")
  ) {
    return true;
  }
  // Legacy URL — still treated as open so old bookmarks work until redirect.
  if (
    trimmed === "/dashboard/area-managers/availability" ||
    trimmed.startsWith("/dashboard/area-managers/availability/")
  ) {
    return true;
  }
  return false;
}

/**
 * Map URL path to dashboard type. Safe to use on client and server.
 */
export function getDashboardTypeFromPath(pagePath: string): DashboardType | null {
  const trimmed = pagePath.replace(/\/$/, "") || "/dashboard";
  // Open / home-like pages are intentionally unmapped (no DashboardType gate).
  if (isOpenDashboardPath(trimmed)) {
    return null;
  }
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
