/** Client-safe types for `public.user_app_category` (name, image, store_type, status, display_order). */

/** Matches `public.store_type` enum — extend when DB adds values. */
export const USER_APP_CATEGORY_STORE_TYPES = [
  "FOOD",
  "GROCERY",
  "PHARMA",
  "FASHION",
  "GENERAL",
  "RESTAURANT",
  "CLOUD_KITCHEN",
  "WAREHOUSE",
  "STORE",
  "GARAGE",
  "STATIONERY",
] as const;

export type UserAppCategoryStoreType = (typeof USER_APP_CATEGORY_STORE_TYPES)[number];

export type UserAppCategoryStatus = "active" | "inactive";

export interface UserAppCategoryRow {
  id: number;
  name: string;
  image_url: string | null;
  store_type: string;
  status: UserAppCategoryStatus;
  display_order: number;
}

export function parseUserAppCategoryStoreType(v: unknown): UserAppCategoryStoreType | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!s) return null;
  return (USER_APP_CATEGORY_STORE_TYPES as readonly string[]).includes(s)
    ? (s as UserAppCategoryStoreType)
    : null;
}

export function parseUserAppCategoryStatus(v: unknown): UserAppCategoryStatus | null {
  if (v === "active" || v === "inactive") return v;
  return null;
}

/** Integer sort key for app browse; rejects non-finite values. */
export function parseUserAppCategoryDisplayOrder(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
