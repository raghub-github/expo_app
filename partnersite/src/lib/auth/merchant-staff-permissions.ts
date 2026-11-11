/** Mirrors merchant app + backend merchant-account-resolve permission matrix. */

export type MerchantStaffRole = "OWNER" | "MANAGER" | "STAFF";

const ROLE_PERMISSION_IDS: Record<MerchantStaffRole, readonly string[]> = {
  OWNER: ["home", "menu", "promo", "ads", "operations", "users", "outlet", "payouts"],
  MANAGER: ["home", "menu", "promo", "operations", "users", "outlet", "payouts"],
  STAFF: ["home", "operations"],
};

export function permissionsForMerchantRole(role: MerchantStaffRole): string[] {
  return [...ROLE_PERMISSION_IDS[role]];
}

export function partnerHasPermission(
  accessRole: MerchantStaffRole | undefined,
  permissions: string[] | undefined,
  permissionId: string
): boolean {
  if (Array.isArray(permissions)) {
    return permissions.includes(permissionId);
  }
  if (!accessRole) return false;
  return ROLE_PERMISSION_IDS[accessRole].includes(permissionId);
}

export const PARTNER_NAV_PERMISSION: Record<string, string> = {
  "/partners/dashboard": "home",
  "/partners/orders": "operations",
  "/partners/order-history": "operations",
  "/partners/menu": "menu",
  "/partners/offers": "promo",
  "/partners/payments": "payouts",
  "/partners/user-insights": "home",
  "/partners/support-inbox": "operations",
  "/partners/store-settings": "outlet",
  "/partners/profile": "operations",
};
