/**
 * Dashboard Access API Route
 * GET /api/auth/dashboard-access - Get current user's dashboard access
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDashboardAccess, getUserAccessPoints } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get system user
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Check if super admin - they have access to all dashboards
    const { isSuperAdmin } = await import("@/lib/permissions/engine");
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);

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
    
    // Get access points for each dashboard
    const allAccessPoints = [];
    for (const dashboard of dashboards) {
      const accessPoints = await getUserAccessPoints(systemUser.id, dashboard.dashboardType as any);
      allAccessPoints.push(...accessPoints);
    }

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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
