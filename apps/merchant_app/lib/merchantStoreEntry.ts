import type { ChildStore } from "@/context/AuthContext";

/** Outlets the merchant app can operate (live or delisted — not draft/onboarding). */
export function canEnterMerchantApp(store: ChildStore): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  return status === "APPROVED" || status === "DELISTED";
}

export function enterableStoresOf(stores: ChildStore[] | null | undefined): ChildStore[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter(canEnterMerchantApp);
}
