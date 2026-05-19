export const STORE_ACTION_SOURCES = ["dashboard", "partnersite", "merchant_app"] as const;
export type StoreActionSource = (typeof STORE_ACTION_SOURCES)[number];

export function normalizeStoreActionSource(raw: unknown): StoreActionSource | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "dashboard" || v === "partnersite" || v === "merchant_app") return v;
  return null;
}
