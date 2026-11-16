/** Mirrors merchant app + backend merchant-account-resolve permission matrix. */

export type MerchantStaffRole = "OWNER" | "MANAGER" | "STAFF";

export type StaffPermissionDef = {
  id: string;
  title: string;
  description: string;
};

/** Display matrix for View permissions sheet (same copy as merchant app). */
export const STAFF_PERMISSIONS: StaffPermissionDef[] = [
  { id: "home", title: "Home", description: "Business reports, payouts etc." },
  {
    id: "menu",
    title: "Menu management",
    description: "View catalog; mark in/out of stock (owners/managers also edit items & photos)",
  },
  { id: "promo", title: "Marketing | Promo", description: "Create and manage discounts" },
  { id: "ads", title: "Marketing | Ads", description: "Create and manage ad campaigns" },
  {
    id: "operations",
    title: "Operations",
    description: "Orders & items management, action on complaints etc.",
  },
  {
    id: "users",
    title: "Manage users",
    description: "Edit owner, manager, staff contact details",
  },
  {
    id: "outlet",
    title: "Manage outlet settings",
    description: "Adjust outlet timings, contact info & more",
  },
  {
    id: "payouts",
    title: "Manage payouts",
    description: "View payouts, invoices & tax certificates",
  },
];

const ROLE_PERMISSION_IDS: Record<MerchantStaffRole, readonly string[]> = {
  OWNER: ["home", "menu", "promo", "ads", "operations", "users", "outlet", "payouts"],
  MANAGER: ["home", "menu", "promo", "operations", "users", "outlet", "payouts"],
  /** Catalog stock toggles allowed; item edit / image upload blocked in UI + API. */
  STAFF: ["home", "operations", "menu"],
};

export function permissionsForMerchantRole(role: MerchantStaffRole): string[] {
  return [...ROLE_PERMISSION_IDS[role]];
}

export function roleHasPermission(role: MerchantStaffRole, permissionId: string): boolean {
  return ROLE_PERMISSION_IDS[role].includes(permissionId);
}

export function normalizeStaffRole(role: string | null | undefined): MerchantStaffRole {
  const r = String(role ?? "")
    .trim()
    .toUpperCase();
  if (r === "OWNER" || r === "PARTNER") return "OWNER";
  if (r === "MANAGER") return "MANAGER";
  return "STAFF";
}

export function partnerHasPermission(
  accessRole: MerchantStaffRole | undefined,
  permissions: string[] | undefined,
  permissionId: string
): boolean {
  if (accessRole != null && String(accessRole).trim() !== "") {
    return roleHasPermission(accessRole, permissionId);
  }
  if (Array.isArray(permissions)) {
    return permissions.includes(permissionId);
  }
  return false;
}

export const STAFF_ROLE_OPTIONS: { key: MerchantStaffRole; label: string }[] = [
  { key: "OWNER", label: "Owner" },
  { key: "MANAGER", label: "Manager" },
  { key: "STAFF", label: "Staff" },
];

/**
 * Partnersite nav → permission id (exact same matrix as merchant app tabs).
 * STAFF: home + operations + menu (stock-only) → dashboard/orders/history/menu/support/profile.
 * MANAGER: all except ads.
 * OWNER: all.
 */
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
  "/partners/profile": "home",
  "/partners/all-stores": "home",
};

/** Deny-by-default gate used by sidebar + page guards (mirrors merchant app). */
export function partnerSessionHasPermission(
  session:
    | {
        accessRole?: string | null;
        permissions?: string[] | null;
      }
    | null
    | undefined,
  permissionId: string
): boolean {
  const raw = session?.accessRole;
  if (raw != null && String(raw).trim() !== "") {
    return roleHasPermission(normalizeStaffRole(raw), permissionId);
  }
  if (Array.isArray(session?.permissions)) {
    return session.permissions.includes(permissionId);
  }
  // No role on session → treat as unauthenticated for RBAC (never default OWNER).
  return false;
}

/** Staff can open Menu and toggle stock — not edit item details / upload photos. */
export function partnerCanEditMenuDetails(session: {
  accessRole?: string | null;
  permissions?: string[] | null;
} | null | undefined): boolean {
  if (!partnerSessionHasPermission(session, "menu")) return false;
  return normalizeStaffRole(session?.accessRole) !== "STAFF";
}

export function partnerCanManageMenuStock(session: {
  accessRole?: string | null;
  permissions?: string[] | null;
} | null | undefined): boolean {
  return partnerSessionHasPermission(session, "menu");
}
