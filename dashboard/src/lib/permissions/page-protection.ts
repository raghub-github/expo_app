/**
 * Page Protection Utilities
 * 
 * Server-side utilities to protect dashboard pages based on dashboard access
 */

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin, getDashboardTypeFromPath } from "./engine";
import type { DashboardType } from "../db/schema";

/**
 * Require super admin (server-side). Redirects if not.
 */
export async function requireSuperAdminAccess(
  redirectTo: string = "/dashboard"
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    redirect("/login");
  }

  const email = session.user.email;
  if (!email) {
    redirect("/login");
  }

  const userIsSuperAdmin = await isSuperAdmin(session.user.id, email);
  if (!userIsSuperAdmin) {
    redirect(redirectTo);
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
  const supabase = await createServerSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    redirect("/login");
  }

  const email = session.user.email;
  if (!email) {
    redirect("/login");
  }

  // Check if super admin - they have access to all dashboards
  const userIsSuperAdmin = await isSuperAdmin(session.user.id, email);
  if (userIsSuperAdmin) {
    return; // Super admin has access
  }

  // Special case: Payment dashboard is super admin only
  if (dashboardType === "PAYMENT") {
    redirect(redirectTo);
  }

  // Check dashboard access
  const hasAccess = await hasDashboardAccessByAuth(
    session.user.id,
    email,
    dashboardType
  );

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
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session || !session.user.email) {
      return false;
    }

    // Check if super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email);
    if (userIsSuperAdmin) {
      return true;
    }

    // Special case: Payment dashboard is super admin only
    if (dashboardType === "PAYMENT") {
      return false;
    }

    // Check dashboard access
    return await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email,
      dashboardType
    );
  } catch (error) {
    console.error("Error checking dashboard access:", error);
    return false;
  }
}
