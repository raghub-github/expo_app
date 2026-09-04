/**
 * Human-readable store / service type labels from canonical DB store_type values.
 * Never invents "Restaurant" when the type is unknown — returns null instead.
 */

const STORE_TYPE_LABELS: Record<string, string> = {
  RESTAURANT: "Restaurant",
  FOOD: "Food",
  GROCERY: "Grocery",
  CLOUD_KITCHEN: "Cloud Kitchen",
  BAKERY: "Bakery",
  CAFE: "Cafe",
  PHARMA: "Pharma",
  FASHION: "Fashion",
  PARCEL: "Parcel",
  RIDE: "Ride",
  ECOM: "E-Commerce",
  E_COMMERCE: "E-Commerce",
  OTHERS: "Other",
  OTHER: "Other",
};

export function normalizeStoreTypeKey(raw: string | null | undefined): string | null {
  const st = String(raw ?? "").trim().toUpperCase();
  return st || null;
}

export function storeTypeDisplayLabel(
  storeType: string | null | undefined,
  customStoreType?: string | null
): string | null {
  const st = normalizeStoreTypeKey(storeType);
  if (!st) return null;
  if (st === "OTHERS" || st === "OTHER") {
    const custom = customStoreType?.trim();
    if (custom) return custom;
  }
  return STORE_TYPE_LABELS[st] ?? st
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Partner bill subtitle e.g. "Grocery Partner · Tax Invoice". */
export function partnerInvoiceSubtitle(storeType: string | null | undefined): string {
  const label = storeTypeDisplayLabel(storeType) ?? "Merchant";
  return `${label} Partner · Tax Invoice`;
}

export function readStoreTypeFromBillingSnapshot(
  snap: Record<string, unknown> | null | undefined
): { storeType: string | null; customStoreType: string | null; label: string | null } {
  if (!snap || typeof snap !== "object") {
    return { storeType: null, customStoreType: null, label: null };
  }
  const storeType =
    normalizeStoreTypeKey(
      (typeof snap.store_type === "string" && snap.store_type) ||
        (typeof snap.storeType === "string" && snap.storeType) ||
        null
    ) ?? null;
  const customStoreType =
    (typeof snap.custom_store_type === "string" && snap.custom_store_type.trim()) ||
    (typeof snap.customStoreType === "string" && snap.customStoreType.trim()) ||
    null;
  const label =
    (typeof snap.store_type_label === "string" && snap.store_type_label.trim()) ||
    (typeof snap.storeTypeLabel === "string" && snap.storeTypeLabel.trim()) ||
    storeTypeDisplayLabel(storeType, customStoreType);
  return { storeType, customStoreType, label };
}
