/**
 * Role → permission matrix for the merchant "View permissions" sheet.
 * Mirrors Zomato-style Owner / Manager / Staff capability groups.
 */

export type StaffRoleKey = "OWNER" | "MANAGER" | "STAFF";

export type StaffPermission = {
  id: string;
  title: string;
  description: string;
};

export const STAFF_PERMISSIONS: StaffPermission[] = [
  { id: "home", title: "Home", description: "Business reports, payouts etc." },
  { id: "menu", title: "Menu management", description: "Edit items and item details" },
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

/** Permission ids granted per role. */
export const ROLE_PERMISSION_IDS: Record<StaffRoleKey, ReadonlySet<string>> = {
  OWNER: new Set(STAFF_PERMISSIONS.map((p) => p.id)),
  MANAGER: new Set([
    "home",
    "menu",
    "promo",
    "operations",
    "users",
    "outlet",
    "payouts",
  ]),
  /** Home + operations: orders, feedback reply, live kitchen — no menu/payouts/Flow hub. */
  STAFF: new Set(["home", "operations"]),
};

export function normalizeStaffRole(role: string | null | undefined): StaffRoleKey {
  const r = String(role ?? "")
    .trim()
    .toUpperCase();
  if (r === "OWNER" || r === "PARTNER") return "OWNER";
  if (r === "MANAGER") return "MANAGER";
  return "STAFF";
}

export function roleHasPermission(role: StaffRoleKey, permissionId: string): boolean {
  return ROLE_PERMISSION_IDS[role].has(permissionId);
}

/** True when signed-in merchant access is store STAFF (not owner/manager). */
export function isStaffAccessRole(
  partner: { accessRole?: string | null } | null | undefined
): boolean {
  return String(partner?.accessRole ?? "")
    .trim()
    .toUpperCase() === "STAFF";
}

/** Runtime gate from login/partner payload (deny-by-default when role unknown). */
export function partnerHasPermission(
  partner:
    | {
        accessRole?: string | null;
        permissions?: string[] | null;
      }
    | null
    | undefined,
  permissionId: string
): boolean {
  const rawRole = partner?.accessRole;
  // Prefer role matrix when accessRole is known so stale permission arrays
  // (e.g. pre-home STAFF tokens) cannot hide newly granted capabilities.
  if (rawRole != null && String(rawRole).trim() !== "") {
    return roleHasPermission(normalizeStaffRole(rawRole), permissionId);
  }
  if (Array.isArray(partner?.permissions)) {
    return partner.permissions.includes(permissionId);
  }
  return false;
}

export const STAFF_ROLE_OPTIONS: {
  key: StaffRoleKey;
  label: string;
  icon: "people" | "settings" | "person";
}[] = [
  { key: "OWNER", label: "Owner", icon: "people" },
  { key: "MANAGER", label: "Manager", icon: "settings" },
  { key: "STAFF", label: "Staff", icon: "person" },
];
