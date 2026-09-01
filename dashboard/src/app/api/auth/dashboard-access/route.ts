/**
 * Dashboard Access API Route
 * GET /api/auth/dashboard-access - Get current user's dashboard access
 * Uses getUser() with retry so transient/Supabase errors return 503 (client retries) instead of 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";
import { getUserDashboardAccess, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { getDb, getSql } from "@/lib/db/client";
import { dashboardAccessPoints } from "@/lib/db/schema";
import { apiErrorResponse } from "@/lib/api-errors";
import { and, eq } from "drizzle-orm";
import { resolveAllowedActions } from "@/lib/permissions/access-point-defaults";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

    const mapped = await resolveSystemUserForSupabaseAuth(user.id, user.email);
    if (!mapped) {
      return NextResponse.json({
        success: true,
        data: { dashboards: [], accessPoints: [] },
      });
    }

    // Check if super admin - they have access to all dashboards.
    // Prefer primary_role from mapped user (fast, already loaded) before heavier permission lookup.
    const userIsSuperAdmin =
      mapped.primary_role === "SUPER_ADMIN" ||
      (await isSuperAdmin(user.id, user.email ?? mapped.email));

    if (userIsSuperAdmin) {
      // Super admin has access to all dashboards
      const allDashboards = [
        "RIDER", "MERCHANT", "CUSTOMER",
        "ORDER_FOOD", "ORDER_PERSON_RIDE", "ORDER_PARCEL",
        "TICKET",
        "OFFER", "AREA_MANAGER", "PAYMENT", "SYSTEM", "ANALYTICS"
      ];
      
      return NextResponse.json({
        success: true,
        data: {
          dashboards: allDashboards.map(dt => ({
            dashboardType: dt,
            accessLevel: "FULL_ACCESS",
            isActive: true,
          })),
          accessPoints: [], // Super admin doesn't need access points - they have full access
        },
      });
    }

    // Get dashboard access for regular users
    const dashboards = await getUserDashboardAccess(mapped.id);

    // Fetch all active access points directly for the user.
    // Do not rely on dashboard_access rows only, because legacy/mixed dashboard types
    // can cause valid points (e.g. TICKET_AGENT_STATUS_TOGGLE) to be skipped.
    let allAccessPoints: Array<{
      dashboardType: string;
      accessPointGroup: string;
      accessPointName: string;
      allowedActions: unknown;
      isActive: boolean | null;
    }> = [];

    try {
      const db = getDb();
      allAccessPoints = await db
        .select()
        .from(dashboardAccessPoints)
        .where(
          and(
            eq(dashboardAccessPoints.systemUserId, mapped.id),
            eq(dashboardAccessPoints.isActive, true)
          )
        );
    } catch (queryError) {
      try {
        const sql = getSql();
        const rows = await sql`
          SELECT dashboard_type, access_point_group, access_point_name, allowed_actions, is_active
          FROM dashboard_access_points
          WHERE system_user_id = ${mapped.id}
            AND is_active = true
        `;
        allAccessPoints = rows.map((row: Record<string, unknown>) => ({
          dashboardType: String(row.dashboard_type ?? ""),
          accessPointGroup: String(row.access_point_group ?? ""),
          accessPointName: String(row.access_point_name ?? ""),
          allowedActions: row.allowed_actions,
          isActive: row.is_active as boolean | null,
        }));
      } catch (fallbackError) {
        console.error("[GET /api/auth/dashboard-access] access points query failed:", queryError, fallbackError);
      }
    }
    const hasStatusToggleInAccessPoints = allAccessPoints.some(
      (ap) =>
        String(ap.dashboardType).trim().toUpperCase() === "TICKET" &&
        String(ap.accessPointGroup).trim().toUpperCase() === "TICKET_AGENT_STATUS_TOGGLE" &&
        Array.isArray(ap.allowedActions) &&
        (ap.allowedActions as unknown[]).some((a) => String(a).trim().toUpperCase() === "UPDATE")
    );
    console.info("[GET /api/auth/dashboard-access] resolved access points", {
      systemUserId: mapped.id,
      count: allAccessPoints.length,
      hasStatusToggleInAccessPoints,
      groups: allAccessPoints.map(
        (ap) => `${String(ap.dashboardType).toUpperCase()}:${String(ap.accessPointGroup).toUpperCase()}`
      ),
    });

    return NextResponse.json({
      success: true,
      data: {
        dashboards: dashboards.map(d => ({
          dashboardType: d.dashboardType,
          accessLevel: d.accessLevel,
          isActive: d.isActive,
        })),
        accessPoints: allAccessPoints.map(ap => ({
          dashboardType: ap.dashboardType,
          accessPointGroup: ap.accessPointGroup,
          accessPointName: ap.accessPointName,
          allowedActions: resolveAllowedActions(ap.accessPointGroup, ap.allowedActions),
          isActive: ap.isActive,
        })),
      },
    });
  } catch (error) {
    if (isTimeoutOrAbortError(error) || isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    console.error("[GET /api/auth/dashboard-access] Error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
