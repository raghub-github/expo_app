/**
 * Customer-app store_type filters for merchant listing.
 */

/** Food home — only these verticals (legacy `FOOD` rows included). */
export const CUSTOMER_FOOD_PAGE_STORE_TYPES = new Set([
  "RESTAURANT",
  "CLOUD_KITCHEN",
  "BAKERY",
  "CAFE",
  "FOOD",
]);

export function normalizeMerchantStoreType(raw: string | null | undefined): string {
  const st = String(raw ?? "").trim().toUpperCase();
  return st || "FOOD";
}

export function matchesCustomerMerchantListStoreType(
  storeType: string | null | undefined,
  requested: string
): boolean {
  const req = String(requested ?? "FOOD").trim().toUpperCase();
  const st = normalizeMerchantStoreType(storeType);
  if (req === "ALL") return true;
  if (req === "FOOD") return CUSTOMER_FOOD_PAGE_STORE_TYPES.has(st);
  if (req === "GROCERY") return st === "GROCERY";
  return st === req;
}
