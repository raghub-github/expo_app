/**
 * Dashboard Access API Route
 * GET /api/auth/dashboard-access - Get current user's dashboard access
 * Uses getUser() with retry so transient/Supabase errors return 503 (client retries) instead of 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDashboardAccess, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { getDb } from "@/lib/db/client";
import { dashboardAccessPoints } from "@/lib/db/schema";
import { apiErrorResponse } from "@/lib/api-errors";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    let user: { id: string; email?: string } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user ?? null;
      userError = result.error ?? null;

      if (!userError && user) break;
      if (userError && isInvalidRefreshToken(userError)) break;
      if (userError && isNetworkOrTransientError(userError) && attempt < maxGetUserAttempts) {
        const delay = retryDelaysMs[attempt - 1] ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }

    if (userError || !user) {
      if (userError && isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    // Get system user
    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Check if super admin - they have access to all dashboards
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);

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
    const dashboards = await getUserDashboardAccess(systemUser.id);

    // Fetch all active access points directly for the user.
    // Do not rely on dashboard_access rows only, because legacy/mixed dashboard types
    // can cause valid points (e.g. TICKET_AGENT_STATUS_TOGGLE) to be skipped.
    const db = getDb();
    const allAccessPoints = await db
      .select()
      .from(dashboardAccessPoints)
      .where(
        and(
          eq(dashboardAccessPoints.systemUserId, systemUser.id),
          eq(dashboardAccessPoints.isActive, true)
        )
      );
    const hasStatusToggleInAccessPoints = allAccessPoints.some(
      (ap) =>
        String(ap.dashboardType).trim().toUpperCase() === "TICKET" &&
        String(ap.accessPointGroup).trim().toUpperCase() === "TICKET_AGENT_STATUS_TOGGLE" &&
        Array.isArray(ap.allowedActions) &&
        (ap.allowedActions as unknown[]).some((a) => String(a).trim().toUpperCase() === "UPDATE")
    );
    console.info("[GET /api/auth/dashboard-access] resolved access points", {
      systemUserId: systemUser.id,
      count: allAccessPoints.length,
      hasStatusToggleInAccessPoints,
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
          allowedActions: ap.allowedActions,
          isActive: ap.isActive,
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/auth/dashboard-access] Error:", error);
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
