export type StoreActionSource = "dashboard" | "partnersite" | "merchant_app";

const LABELS: Record<StoreActionSource, string> = {
  dashboard: "Dashboard (GatiMitra Team)",
  partnersite: "Partner site",
  merchant_app: "Merchant app",
};

export function normalizeStoreActionSource(raw: unknown): StoreActionSource | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "dashboard" || v === "partnersite" || v === "merchant_app") return v;
  return null;
}

export function formatStoreActionSourceLabel(raw: unknown): string | null {
  const src = normalizeStoreActionSource(raw);
  return src ? LABELS[src] : null;
}
