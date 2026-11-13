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

export type MerchantAccessRole = "OWNER" | "MANAGER" | "STAFF";

export type MerchantIdentityPartner = {
  parent: MerchantIdentityParent;
  childStores: unknown[];
  activeDevices?: number;
  accessRole?: MerchantAccessRole;
  staffId?: number | null;
  permissions?: string[];
};

function parseAccessRole(raw: unknown): MerchantAccessRole | undefined {
  if (raw === "OWNER" || raw === "MANAGER" || raw === "STAFF") return raw;
  return undefined;
}

export function parsePartnerData(raw: unknown): MerchantIdentityPartner | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<MerchantIdentityPartner> & Record<string, unknown>;
  if (!p.parent || typeof p.parent !== "object" || p.parent.id == null) return null;
  if (
    typeof (p.parent as { parent_merchant_id?: unknown }).parent_merchant_id !== "string" ||
    !String((p.parent as { parent_merchant_id: string }).parent_merchant_id).trim()
  ) {
    return null;
  }
  const accessRole = parseAccessRole(p.accessRole);
  const staffId =
    typeof p.staffId === "number" && Number.isFinite(p.staffId)
      ? p.staffId
      : p.staffId === null
        ? null
        : undefined;
  const permissions = Array.isArray(p.permissions)
    ? p.permissions.filter((x): x is string => typeof x === "string")
    : undefined;
  return {
    parent: p.parent as MerchantIdentityParent,
    childStores: Array.isArray(p.childStores) ? p.childStores : [],
    activeDevices: typeof p.activeDevices === "number" ? p.activeDevices : 0,
    ...(accessRole ? { accessRole } : {}),
    ...(staffId !== undefined ? { staffId } : {}),
    ...(permissions ? { permissions } : {}),
  };
}

/** True when partner payload is enough to enter the Merchant App. */
export function hasValidMerchantIdentity(
  partner: MerchantIdentityPartner | null | undefined
): boolean {
  return parsePartnerData(partner) != null;
}
