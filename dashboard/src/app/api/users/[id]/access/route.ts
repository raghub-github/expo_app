/**
 * User Dashboard Access API Route
 * GET /api/users/[id]/access - Get user's dashboard access
 * PUT /api/users/[id]/access - Update user's dashboard access (super admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDashboardAccess, getUserAccessPoints } from "@/lib/permissions/engine";
import { getSystemUserByEmail, getSystemUserById } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logActionByAuth } from "@/lib/audit/logger";

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await getSystemUserById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Get dashboard access
    const dashboards = await getUserDashboardAccess(userId);
    
    // Get access points for each dashboard
    const allAccessPoints = [];
    for (const dashboard of dashboards) {
      const accessPoints = await getUserAccessPoints(userId, dashboard.dashboardType as any);
      allAccessPoints.push(...accessPoints);
    }

    return NextResponse.json({
      success: true,
      data: {
        dashboards: dashboards.map(d => ({
          id: d.id,
          dashboardType: d.dashboardType,
          accessLevel: d.accessLevel,
          isActive: d.isActive,
          grantedBy: d.grantedBy,
          grantedByName: d.grantedByName,
          grantedAt: d.grantedAt,
        })),
        accessPoints: allAccessPoints.map(ap => ({
          id: ap.id,
          dashboardType: ap.dashboardType,
          accessPointGroup: ap.accessPointGroup,
          accessPointName: ap.accessPointName,
          accessPointDescription: ap.accessPointDescription,
          allowedActions: ap.allowedActions,
          context: ap.context,
          isActive: ap.isActive,
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/users/[id]/access] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await getSystemUserById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const dashboardAccessData = Array.isArray(body.dashboardAccess) ? body.dashboardAccess : [];
    const accessPointsData = Array.isArray(body.accessPoints) ? body.accessPoints : [];

    const actor = await getSystemUserByEmail(session.user.email!);
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Actor not found in system" },
        { status: 404 }
      );
    }

    const db = getDb();

    // Update dashboards: deactivate removed, upsert selected
    const existingDashboards = await db
      .select()
      .from(dashboardAccess)
      .where(eq(dashboardAccess.systemUserId, userId));

    const newDashboardTypes = new Set<string>(
      dashboardAccessData.map((d: any) => String(d.dashboardType))
    );

    // Deactivate dashboards not in new list
    for (const existing of existingDashboards) {
      if (!newDashboardTypes.has(existing.dashboardType)) {
        await db
          .update(dashboardAccess)
          .set({
            isActive: false,
            revokedAt: new Date(),
            revokedBy: null,
            revokeReason: "Updated by super admin",
            updatedAt: new Date(),
          })
          .where(eq(dashboardAccess.id, existing.id));
      }
    }

    // Upsert dashboards in new list
    for (const d of dashboardAccessData) {
      const dashboardType = String(d.dashboardType);
      const accessLevel = String(d.accessLevel || "FULL_ACCESS");
      const existing = existingDashboards.find((x) => x.dashboardType === dashboardType);

      if (existing) {
        await db
          .update(dashboardAccess)
          .set({
            accessLevel,
            isActive: true,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            updatedAt: new Date(),
          })
          .where(eq(dashboardAccess.id, existing.id));
      } else {
        await db.insert(dashboardAccess).values({
          systemUserId: userId,
          dashboardType,
          accessLevel,
          isActive: true,
          grantedBy: actor.id,
          grantedByName: actor.fullName,
        });
      }
    }

    // Update access points: simplest approach = deactivate all then re-insert/upsert selected
    const existingPoints = await db
      .select()
      .from(dashboardAccessPoints)
      .where(eq(dashboardAccessPoints.systemUserId, userId));

    const newKeys = new Set(
      accessPointsData.map((p: any) => `${p.dashboardType}:${p.accessPointGroup}`)
    );

    for (const p of existingPoints) {
      const key = `${p.dashboardType}:${p.accessPointGroup}`;
      if (!newKeys.has(key)) {
        await db
          .update(dashboardAccessPoints)
          .set({
            isActive: false,
            revokedAt: new Date(),
            revokedBy: null,
            revokeReason: "Updated by super admin",
            updatedAt: new Date(),
          })
          .where(eq(dashboardAccessPoints.id, p.id));
      }
    }

    // Use definitions to populate label/description/actions when possible
    const { DASHBOARD_DEFINITIONS } = await import("@/components/users/DashboardAccessSelector");

    for (const p of accessPointsData) {
      const dashboardType = String(p.dashboardType);
      const accessPointGroup = String(p.accessPointGroup);

      let accessPointName = accessPointGroup;
      let accessPointDescription = "";
      let allowedActions: string[] = [];

      const def = (DASHBOARD_DEFINITIONS as any)?.[dashboardType]?.accessPoints?.find(
        (ap: any) => ap.group === accessPointGroup
      );
      if (def) {
        accessPointName = def.label;
        accessPointDescription = def.description;
        allowedActions = def.allowedActions;
      }

      const existing = existingPoints.find(
        (x) => x.dashboardType === dashboardType && x.accessPointGroup === accessPointGroup
      );

      if (existing) {
        await db
          .update(dashboardAccessPoints)
          .set({
            accessPointName,
            accessPointDescription,
            allowedActions,
            context: p.context ?? existing.context,
            isActive: true,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            updatedAt: new Date(),
          })
          .where(eq(dashboardAccessPoints.id, existing.id));
      } else {
        await db.insert(dashboardAccessPoints).values({
          systemUserId: userId,
          dashboardType,
          accessPointGroup,
          accessPointName,
          accessPointDescription,
          allowedActions,
          context: p.context ?? {},
          isActive: true,
          grantedBy: actor.id,
          grantedByName: actor.fullName,
        });
      }
    }

    await logActionByAuth(session.user.id, session.user.email!, "SYSTEM", "UPDATE", {
      resourceType: "USER_ACCESS",
      resourceId: String(userId),
      actionDetails: {
        dashboards: Array.from(newDashboardTypes),
        accessPoints: accessPointsData.map((p: any) => ({
          dashboardType: p.dashboardType,
          accessPointGroup: p.accessPointGroup,
          context: p.context,
        })),
      },
      requestPath: `/api/users/${userId}/access`,
      requestMethod: "PUT",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/users/[id]/access] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
