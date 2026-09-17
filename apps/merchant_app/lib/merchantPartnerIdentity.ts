/**
 * Pure merchant-identity checks — no SecureStore / network imports
 * (so unit tests can run under node:test).
 */

export type MerchantIdentityParent = {
  id: number;
  parent_merchant_id: string;
  parent_name?: string;
  owner_name?: string;
  owner_email?: string;
  brand_name?: string;
  registered_phone?: string;
  store_logo?: string | null;
};

export type MerchantIdentityPartner = {
  parent: MerchantIdentityParent;
  childStores: unknown[];
  activeDevices?: number;
};

export function parsePartnerData(raw: unknown): MerchantIdentityPartner | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<MerchantIdentityPartner>;
  if (!p.parent || typeof p.parent !== "object" || p.parent.id == null) return null;
  if (
    typeof (p.parent as { parent_merchant_id?: unknown }).parent_merchant_id !== "string" ||
    !String((p.parent as { parent_merchant_id: string }).parent_merchant_id).trim()
  ) {
    return null;
  }
  return {
    parent: p.parent as MerchantIdentityParent,
    childStores: Array.isArray(p.childStores) ? p.childStores : [],
    activeDevices: typeof p.activeDevices === "number" ? p.activeDevices : 0,
  };
}

/** True when partner payload is enough to enter the Merchant App. */
export function hasValidMerchantIdentity(
  partner: MerchantIdentityPartner | null | undefined
): boolean {
  return parsePartnerData(partner) != null;
}
