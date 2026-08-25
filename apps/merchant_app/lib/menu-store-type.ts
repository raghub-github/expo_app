/** Sync store-type helpers for menu forms (no network). */

export function normalizeStoreType(storeType: string | null | undefined): string {
  return (storeType ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function isGroceryStoreType(storeType: string | null | undefined): boolean {
  return normalizeStoreType(storeType) === "GROCERY";
}

export function itemFormVariantForStoreType(
  storeType: string | null | undefined
): "grocery" | "standard" {
  return isGroceryStoreType(storeType) ? "grocery" : "standard";
}
