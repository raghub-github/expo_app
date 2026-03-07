/**
 * Dashboard Access API Route
 * GET /api/auth/dashboard-access - Get current user's dashboard access
 * Uses getUser() with retry so transient/Supabase errors return 503 (client retries) instead of 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDashboardAccess, getUserAccessPoints, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { apiErrorResponse } from "@/lib/api-errors";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard-access/route.ts:19',message:'Dashboard access API start',data:{timestamp:startTime},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
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
    const dashboardsStartTime = Date.now();
    const dashboards = await getUserDashboardAccess(systemUser.id);
    const dashboardsDuration = Date.now() - dashboardsStartTime;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard-access/route.ts:96',message:'getUserDashboardAccess completed',data:{dashboardsCount:dashboards.length,durationMs:dashboardsDuration},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Get access points for all dashboards in parallel (faster first paint)
    const accessPointsArrays = await Promise.all(
      dashboards.map((d) => getUserAccessPoints(systemUser.id, d.dashboardType as "RIDER" | "MERCHANT" | "TICKET" | "ORDER_FOOD" | "ORDER_PARCEL" | "ORDER_PERSON_RIDE" | "OFFER" | "AREA_MANAGER" | "CUSTOMER" | "PAYMENT" | "SYSTEM" | "ANALYTICS"))
    );
    const allAccessPoints = accessPointsArrays.flat();

    const totalDuration = Date.now() - startTime;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard-access/route.ts:105',message:'Dashboard access API complete',data:{totalDurationMs:totalDuration,dashboardsCount:dashboards.length,accessPointsCount:allAccessPoints.length},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
