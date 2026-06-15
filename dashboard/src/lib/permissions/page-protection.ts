/**
 * Page Protection Utilities
 *
 * Server-side utilities to protect dashboard pages based on dashboard access.
 * Uses getUser() (with retry) for reliable session on refresh; getSession() can be stale.
 * On invalid/expired refresh token, clears session (signOut) so the user can log in again.
 */

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import {
  isSuperAdmin,
  getDashboardTypeFromPath,
  hasAccessPointAction,
  getUserPermissions,
  hasDashboardAccess,
} from "./engine";
import type { AccessPointGroup, ActionType, DashboardType } from "../db/schema";

const maxGetUserAttempts = 2;

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  let user: { id: string; email?: string } | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
    const { data, error } = await supabase.auth.getUser();
    user = data?.user ?? null;
    lastError = error ?? null;
    if (!lastError && user?.email) return { user, error: null };
    if (lastError && isInvalidRefreshToken(lastError)) break;
    if (attempt < maxGetUserAttempts) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (lastError && isInvalidRefreshToken(lastError)) {
    await supabase.auth.signOut();
  }

  return { user, error: lastError };
}

/**
 * Require super admin (server-side). Redirects if not.
 */
export async function requireSuperAdminAccess(
  redirectTo: string = "/dashboard"
): Promise<void> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    redirect("/login");
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
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
    redirect("/login");
  }

  const userPerms = await getUserPermissions(user.id, user.email);
  if (!userPerms) {
    redirect("/login");
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
 * Check if user has access to a dashboard page and redirect if not
 * Use this in server components to protect dashboard pages
 */
export async function requireDashboardAccess(
  dashboardType: DashboardType,
  redirectTo: string = "/dashboard"
): Promise<void> {
  const { user, error } = await getAuthenticatedUser();

  if (error || !user?.email) {
    redirect("/login");
  }

  const userPerms = await getUserPermissions(user.id, user.email);
  if (!userPerms) {
    redirect("/login");
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
