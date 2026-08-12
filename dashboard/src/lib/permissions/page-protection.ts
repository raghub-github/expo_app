/**
 * Page Protection Utilities
 *
 * Server-side utilities to protect dashboard pages based on dashboard access.
 * Uses getUser() (with cookie-session fallback when Auth is unreachable).
 * Irrecoverable refresh failures clear the session; parallel refresh races do not.
 *
 * IMPORTANT: Only send users to /login when Supabase auth itself fails.
 * Authorization / permissions lookup failures must NOT wipe the session UX
 * (that was logging super-admins out when opening Payments under DB load).
 */

import { redirect } from "next/navigation";
import { resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import {
  isSuperAdmin,
  getDashboardTypeFromPath,
  hasAccessPointAction,
  getUserPermissions,
  hasDashboardAccess,
  getUserDashboardAccess,
  getSystemUserIdFromAuthUser,
} from "./engine";
import { isOpenDashboardPath } from "./path-mapping";
import type { AccessPointGroup, ActionType, DashboardType } from "../db/schema";

async function getAuthenticatedUser() {
  const { user, error } = await resolveSupabaseUser({ maxAttempts: 2 });
  return { user, error };
}

function isTransientPageAuthFailure(error: unknown): boolean {
  return (
    isTimeoutOrAbortError(error) ||
    isNetworkOrTransientError(error) ||
    isRefreshTokenAlreadyUsed(error)
  );
}

/**
 * Require super admin (server-side). Redirects if not.
 */
export async function requireSuperAdminAccess(
  redirectTo: string = "/dashboard"
): Promise<void> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    if (error && isTransientPageAuthFailure(error)) {
      redirect(redirectTo);
    }
    if (!user?.email) {
      redirect("/login");
    }
    redirect(redirectTo);
  }

  let userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
  if (!userIsSuperAdmin) {
    // One retry — permissions cache/DB can blip under Payments page load pressure.
    await new Promise((r) => setTimeout(r, 250));
    userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
  }
  if (!userIsSuperAdmin) {
    redirect(redirectTo);
  }
}

/**
 * Resolve the default orders sub-dashboard in one auth round-trip (food → parcel → ride).
 * Redirects to login when the session is missing or invalid.
 */
export async function getDefaultOrdersDashboardHref(): Promise<string | null> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    if (error && isTransientPageAuthFailure(error)) {
      return "/dashboard";
    }
    redirect("/login");
  }

  const userPerms = await getUserPermissions(user.id, user.email);
  if (!userPerms) {
    // Permissions lookup failed (e.g. DB blip) — do not treat as logout.
    return "/dashboard";
  }

  if (userPerms.isSuperAdmin) {
    return "/dashboard/orders/food";
  }

  const [hasFood, hasParcel, hasRide] = await Promise.all([
    hasDashboardAccess(userPerms.systemUserId, "ORDER_FOOD"),
    hasDashboardAccess(userPerms.systemUserId, "ORDER_PARCEL"),
    hasDashboardAccess(userPerms.systemUserId, "ORDER_PERSON_RIDE"),
  ]);

  if (hasFood) return "/dashboard/orders/food";
  if (hasParcel) return "/dashboard/orders/parcel";
  if (hasRide) return "/dashboard/orders/person-ride";

  return null;
}

/**
 * Require any authenticated dashboard agent (same bar as Home).
 * No specific DashboardType grant required — just a valid session with ≥1 dashboard.
 */
export async function requireAnyDashboardAccess(
  redirectTo: string = "/login"
): Promise<void> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    if (error && isTransientPageAuthFailure(error)) {
      redirect("/dashboard");
    }
    if (!user?.email) {
      redirect(redirectTo);
    }
    redirect("/dashboard");
  }

  const userPerms = await getUserPermissions(user.id, user.email);
  if (!userPerms) {
    console.warn(
      `[requireAnyDashboardAccess] permissions unavailable for ${user.email}; soft-fail to /dashboard`
    );
    redirect("/dashboard");
  }
  if (userPerms.isSuperAdmin) {
    return;
  }

  const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email);
  if (!systemUserId) {
    redirect("/dashboard");
  }
  const dashboards = await getUserDashboardAccess(systemUserId);
  if (dashboards.length === 0) {
    redirect("/dashboard");
  }
}

/**
 * Check if user has access to a dashboard page and redirect if not
 * Use this in server components to protect dashboard pages
 */
export async function requireDashboardAccess(
  dashboardType: DashboardType,
  redirectTo: string = "/dashboard"
): Promise<void> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    if (error && isTransientPageAuthFailure(error)) {
      redirect(redirectTo);
    }
    if (!user?.email) {
      redirect("/login");
    }
    redirect(redirectTo);
  }

  const userPerms = await getUserPermissions(user.id, user.email);
  if (!userPerms) {
    // Authenticated but permissions unavailable (DB timeout / pool pressure).
    // NEVER send to /login — that was the Payments auto-logout bug.
    console.warn(
      `[requireDashboardAccess] permissions unavailable for ${user.email}; soft-fail to ${redirectTo}`
    );
    redirect(redirectTo);
  }
  if (userPerms.isSuperAdmin) {
    return;
  }

  // Special case: Payment dashboard is super admin only
  if (dashboardType === "PAYMENT") {
    redirect(redirectTo);
  }

  const hasAccess = await hasDashboardAccess(userPerms.systemUserId, dashboardType);
  if (!hasAccess) {
    redirect(redirectTo);
  }
}

/**
 * Check if user has access to a dashboard page by path
 * Use this when you have the page path instead of dashboard type
 */
export async function requireDashboardAccessByPath(
  pagePath: string,
  redirectTo: string = "/dashboard"
): Promise<void> {
  if (isOpenDashboardPath(pagePath)) {
    await requireAnyDashboardAccess(redirectTo === "/dashboard" ? "/login" : redirectTo);
    return;
  }

  const dashboardType = getDashboardTypeFromPath(pagePath);

  if (!dashboardType) {
    // Unknown page - deny access
    redirect(redirectTo);
  }

  await requireDashboardAccess(dashboardType, redirectTo);
}

/**
 * Get dashboard access status without redirecting
 * Returns true if user has access, false otherwise
 */
export async function checkDashboardAccess(
  dashboardType: DashboardType
): Promise<boolean> {
  try {
    const { user, error } = await getAuthenticatedUser();

    // Transient Auth blip after idle — do not treat as "no access" (that forces
    // requireSuperAdminAccess → redirect and looks like a crash on All).
    if ((!user?.email) && error && isTransientPageAuthFailure(error)) {
      return true;
    }

    if (error || !user?.email) {
      return false;
    }

    const userPerms = await getUserPermissions(user.id, user.email);
    if (!userPerms) {
      return false;
    }
    if (userPerms.isSuperAdmin) {
      return true;
    }

    if (dashboardType === "PAYMENT") {
      return false;
    }

    return hasDashboardAccess(userPerms.systemUserId, dashboardType);
  } catch (err) {
    if (isTransientPageAuthFailure(err)) {
      return true;
    }
    console.error("Error checking dashboard access:", err);
    return false;
  }
}

/**
 * Check access-point action without redirecting.
 * Useful for page-level guards that depend on specific feature toggles.
 */
export async function checkDashboardAccessPointAction(
  dashboardType: DashboardType,
  accessPointGroup: AccessPointGroup,
  actionType: ActionType
): Promise<boolean> {
  try {
    const { user, error } = await getAuthenticatedUser();
    if (error || !user?.email) {
      return false;
    }

    const userPerms = await getUserPermissions(user.id, user.email);
    if (!userPerms) {
      return false;
    }
    if (userPerms.isSuperAdmin) {
      return true;
    }

    const hasAccess = await hasDashboardAccess(userPerms.systemUserId, dashboardType);
    if (!hasAccess) {
      return false;
    }

    return hasAccessPointAction(
      userPerms.systemUserId,
      dashboardType,
      accessPointGroup,
      actionType
    );
  } catch (err) {
    console.error("Error checking dashboard access point action:", err);
    return false;
  }
}
