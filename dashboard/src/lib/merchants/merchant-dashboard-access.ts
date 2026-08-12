import type { DashboardSubRoute } from "@/lib/navigation/dashboard-routes";

export type MerchantAccessPointLike = {
  dashboardType?: string;
  accessPointGroup?: string;
  allowedActions?: string[] | null;
  isActive?: boolean;
};

/** Groups that grant mutating merchant capabilities (anything beyond view). */
const MERCHANT_MUTATION_GROUPS = new Set([
  "MERCHANT_ONBOARDING",
  "MERCHANT_OPERATIONS",
  "MERCHANT_STORE_MANAGEMENT",
  "MERCHANT_WALLET",
  "MERCHANT_ADMIN_MERCHANT_ACCESS",
  "MERCHANT_WALLET_REQUESTS",
  "MERCHANT_MENU_MANAGEMENT",
  "MERCHANT_OFFER_MANAGEMENT",
  "MERCHANT_BANK_MANAGEMENT",
  "MERCHANT_TIMING_MANAGEMENT",
  "MERCHANT_STATUS_MANAGEMENT",
  "MERCHANT_ITEM_APPROVAL",
]);

function activeMerchantPoints(accessPoints: MerchantAccessPointLike[] | null | undefined) {
  return (accessPoints ?? []).filter(
    (ap) =>
      ap.isActive !== false &&
      String(ap.dashboardType || "").toUpperCase() === "MERCHANT" &&
      Boolean(ap.accessPointGroup)
  );
}

/** True when user has Admin&Merchant access point (or superadmin). Not inferred from can_toggle_portal alone. */
export function hasMerchantAdminAccess(args: {
  isSuperAdmin?: boolean;
  canTogglePortal?: boolean;
  accessPoints?: MerchantAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return true;
  return activeMerchantPoints(args.accessPoints).some(
    (ap) => String(ap.accessPointGroup).toUpperCase() === "MERCHANT_ADMIN_MERCHANT_ACCESS"
  );
}

/** Portal Admin/Merchant switch — may use can_toggle_portal without granting CRUD. */
export function canToggleMerchantPortal(args: {
  isSuperAdmin?: boolean;
  canTogglePortal?: boolean;
  accessPoints?: MerchantAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return true;
  if (args.canTogglePortal) return true;
  return hasMerchantAdminAccess(args);
}

export function getMerchantAccessGroups(
  accessPoints?: MerchantAccessPointLike[] | null
): string[] {
  return [
    ...new Set(
      activeMerchantPoints(accessPoints).map((ap) => String(ap.accessPointGroup).toUpperCase())
    ),
  ];
}

export function isMerchantViewOnlyAccess(args: {
  isSuperAdmin?: boolean;
  canTogglePortal?: boolean;
  accessPoints?: MerchantAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return false;
  // Admin&Merchant access point = not view-only. can_toggle_portal alone does NOT unlock CRUD.
  if (hasMerchantAdminAccess(args)) return false;
  // Treat as view-only whenever no merchant mutation groups are granted
  // (MERCHANT_VIEW alone, empty grants, or non-mutation groups only).
  // Do not rely solely on computeEffectiveAccessLevel — RESTRICTED/PARTIAL
  // edge cases must still block Approve / settings CRUD.
  return !merchantCanMutate(args);
}

export function merchantHasAccessGroup(
  accessPoints: MerchantAccessPointLike[] | null | undefined,
  group: string
): boolean {
  const needle = group.toUpperCase();
  return activeMerchantPoints(accessPoints).some(
    (ap) => String(ap.accessPointGroup).toUpperCase() === needle
  );
}

export function merchantHasAction(
  accessPoints: MerchantAccessPointLike[] | null | undefined,
  group: string,
  action: string
): boolean {
  const needleGroup = group.toUpperCase();
  const needleAction = action.toUpperCase();
  return activeMerchantPoints(accessPoints).some((ap) => {
    if (String(ap.accessPointGroup).toUpperCase() !== needleGroup) return false;
    const actions = (ap.allowedActions ?? []).map((a) => String(a).toUpperCase());
    return actions.includes(needleAction);
  });
}

export function merchantCanMutate(args: {
  isSuperAdmin?: boolean;
  canTogglePortal?: boolean;
  accessPoints?: MerchantAccessPointLike[] | null;
}): boolean {
  if (args.isSuperAdmin) return true;
  if (hasMerchantAdminAccess(args)) return true;
  const groups = getMerchantAccessGroups(args.accessPoints);
  return groups.some((g) => MERCHANT_MUTATION_GROUPS.has(g));
}

/**
 * Map store-scoped sidebar routes to required merchant access groups.
 *
 * MERCHANT_VIEW (and view-only users) can open every store page for read access,
 * except Menu change requests (approval workflow — hidden unless they can mutate menu).
 * Mutation CTAs are gated separately via canMutate / canManageStore / canOperateStore / etc.
 *
 * Users without MERCHANT_VIEW only see pages matching their granted mutation groups
 * (plus Dashboard when they have any merchant access).
 */
export function filterStoreScopedRoutesByMerchantAccess(
  routes: DashboardSubRoute[],
  args: {
    isSuperAdmin?: boolean;
    canTogglePortal?: boolean;
    accessPoints?: MerchantAccessPointLike[] | null;
  }
): DashboardSubRoute[] {
  const isMenuChangeRequestsRoute = (route: DashboardSubRoute) => {
    const name = route.name.toLowerCase();
    const href = route.href.toLowerCase();
    return name === "menu change requests" || href.endsWith("/menu-change-requests");
  };

  const canSeeMenuChangeRequests = (): boolean => {
    if (args.isSuperAdmin) return true;
    if (isMerchantViewOnlyAccess(args)) return false;
    if (hasMerchantAdminAccess(args)) return true;
    const groups = new Set(getMerchantAccessGroups(args.accessPoints));
    return (
      groups.has("MERCHANT_ITEM_APPROVAL") ||
      groups.has("MERCHANT_MENU_MANAGEMENT") ||
      groups.has("MERCHANT_STORE_MANAGEMENT")
    );
  };

  const applyMenuChangeVisibility = (list: DashboardSubRoute[]) =>
    canSeeMenuChangeRequests()
      ? list
      : list.filter((route) => !isMenuChangeRequestsRoute(route));

  if (args.isSuperAdmin) return routes;

  // Portal toggle still sees store pages; Menu change requests gated by canSeeMenuChangeRequests.
  if (args.canTogglePortal) {
    return applyMenuChangeVisibility(routes);
  }

  const groups = new Set(getMerchantAccessGroups(args.accessPoints));
  if (groups.size === 0) return [];

  // View Merchant Details → full store nav (read-only actions enforced in UI/API),
  // minus Menu change requests for view-only.
  if (groups.has("MERCHANT_VIEW") || isMerchantViewOnlyAccess(args)) {
    return applyMenuChangeVisibility(routes);
  }

  const hasStoreMgmt =
    groups.has("MERCHANT_STORE_MANAGEMENT") ||
    groups.has("MERCHANT_MENU_MANAGEMENT") ||
    groups.has("MERCHANT_ITEM_APPROVAL");
  const hasOps =
    groups.has("MERCHANT_OPERATIONS") ||
    groups.has("MERCHANT_STATUS_MANAGEMENT") ||
    groups.has("MERCHANT_TIMING_MANAGEMENT");
  const hasWallet =
    groups.has("MERCHANT_WALLET") || groups.has("MERCHANT_WALLET_REQUESTS");
  const hasOnboarding = groups.has("MERCHANT_ONBOARDING");
  const hasOffers = groups.has("MERCHANT_OFFER_MANAGEMENT") || hasStoreMgmt;
  const hasAny = groups.size > 0;

  const filtered = routes.filter((route) => {
    const name = route.name.toLowerCase();
    const href = route.href.toLowerCase();

    if (name === "dashboard") return hasAny;
    if (name === "profile" || href.endsWith("/profile")) return hasAny || hasOnboarding;
    if (name === "user insights" || href.endsWith("/user-insights")) return hasAny;
    if (name === "activity log" || href.endsWith("/activity")) return hasAny;
    if (name === "orders" || href.endsWith("/orders")) return hasAny || hasOps;
    if (name === "menu" || href.endsWith("/menu")) return hasStoreMgmt;
    if (isMenuChangeRequestsRoute(route)) return hasStoreMgmt;
    if (name === "offers" || href.endsWith("/offers")) return hasOffers;
    if (name === "payments" || href.endsWith("/payments")) return hasWallet;
    if (name === "settings" || href.endsWith("/store-settings")) return hasOps || hasStoreMgmt;

    return hasAny;
  });

  return applyMenuChangeVisibility(filtered);
}
