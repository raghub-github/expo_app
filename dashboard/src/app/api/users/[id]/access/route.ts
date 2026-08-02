/**
 * User Dashboard Access API Route
 * GET /api/users/[id]/access - Get user's dashboard access
 * PUT /api/users/[id]/access - Update user's dashboard access (super admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDashboardAccess } from "@/lib/permissions/engine";
import { getSystemUserByEmail, getSystemUserById } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints, systemUsers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { logActionByAuth } from "@/lib/audit/logger";

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();

    if (userError || !authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(authUser.id, authUser.email ?? "");
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

    // Fetch active access points directly to avoid missing rows due to dashboard type variance.
    const db = getDb();
    const allAccessPoints = await db
      .select()
      .from(dashboardAccessPoints)
      .where(and(eq(dashboardAccessPoints.systemUserId, userId), eq(dashboardAccessPoints.isActive, true)));

    const { DASHBOARD_DEFINITIONS } = await import("@/components/users/DashboardAccessSelector");
    const { computeEffectiveAccessLevel } = await import("@/lib/permissions/access-level");
    const allAccessPointDefs = Object.values(DASHBOARD_DEFINITIONS).flatMap((d) => d.accessPoints);

    const pointsByDashboard = allAccessPoints.reduce<Record<string, string[]>>((acc, ap) => {
      const dt = String(ap.dashboardType);
      if (!acc[dt]) acc[dt] = [];
      acc[dt].push(String(ap.accessPointGroup));
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        canTogglePortal: Boolean(user.canTogglePortal),
        dashboards: dashboards.map(d => ({
          id: d.id,
          dashboardType: d.dashboardType,
          accessLevel: computeEffectiveAccessLevel(
            d.dashboardType,
            pointsByDashboard[d.dashboardType] || []
          ),
          storedAccessLevel: d.accessLevel,
          isActive: d.isActive,
          grantedBy: d.grantedBy,
          grantedByName: d.grantedByName,
          grantedAt: d.grantedAt,
        })),
        accessPoints: allAccessPoints.map((ap) => {
          const dashboardType = String(ap.dashboardType);
          const accessPointGroup = String(ap.accessPointGroup);
          const dashboardScopedDef = (DASHBOARD_DEFINITIONS as any)?.[dashboardType]?.accessPoints?.find(
            (p: any) => p.group === accessPointGroup
          );
          const fallbackDef = allAccessPointDefs.find((p: any) => p.group === accessPointGroup);
          const def = dashboardScopedDef ?? fallbackDef;

          let allowedActions = Array.isArray(ap.allowedActions) ? (ap.allowedActions as string[]) : [];
          if (allowedActions.length === 0 && def && Array.isArray(def.allowedActions)) {
            allowedActions = def.allowedActions;
          }

          return {
            id: ap.id,
            dashboardType,
            accessPointGroup,
            accessPointName: ap.accessPointName,
            accessPointDescription: ap.accessPointDescription ?? undefined,
            allowedActions,
            context: (ap.context as Record<string, any>) ?? undefined,
            isActive: ap.isActive === true,
          };
        }),
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
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user permissions (includes super admin check and system user)
    const { getUserPermissions } = await import("@/lib/permissions/engine");
    const userPerms = await getUserPermissions(authUser.id, authUser.email ?? "");
    if (!userPerms || !userPerms.isSuperAdmin) {
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
    const canTogglePortal = typeof body.can_toggle_portal === "boolean" ? body.can_toggle_portal : undefined;

    // Get actor details (use cached getSystemUserByEmail which is already called in getUserPermissions)
    const actor = await getSystemUserByEmail(authUser.email ?? "");
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Actor not found in system" },
        { status: 404 }
      );
    }

    const db = getDb();

    if (typeof canTogglePortal === "boolean") {
      await db
        .update(systemUsers)
        .set({
          canTogglePortal,
          updatedAt: new Date(),
        })
        .where(eq(systemUsers.id, userId));
    }

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
    const allAccessPointDefs = Object.values(DASHBOARD_DEFINITIONS).flatMap((d) => d.accessPoints);

    for (const p of accessPointsData) {
      const dashboardType = String(p.dashboardType);
      const accessPointGroup = String(p.accessPointGroup);

      let accessPointName = accessPointGroup;
      let accessPointDescription = "";
      let allowedActions: string[] = [];

      const dashboardScopedDef = (DASHBOARD_DEFINITIONS as any)?.[dashboardType]?.accessPoints?.find(
        (ap: any) => ap.group === accessPointGroup
      );
      const fallbackDef = allAccessPointDefs.find((ap: any) => ap.group === accessPointGroup);
      const def = dashboardScopedDef ?? fallbackDef;
      if (def) {
        accessPointName = def.label;
        accessPointDescription = def.description;
        allowedActions = Array.isArray(def.allowedActions) ? def.allowedActions : [];
      }
      if (allowedActions.length === 0 && Array.isArray((p as any).allowedActions)) {
        allowedActions = (p as any).allowedActions;
      }
      const groupUpper = accessPointGroup.trim().toUpperCase();
      if (allowedActions.length === 0 && groupUpper === "TICKET_AGENT_STATUS_TOGGLE") {
        allowedActions = ["UPDATE"];
      } else if (
        allowedActions.length === 0 &&
        (groupUpper === "TICKET_QUEUE_SUPERVISOR" || groupUpper === "TICKET_QUEUE_MANAGER")
      ) {
        allowedActions = ["VIEW"];
      }

      const existing = existingPoints.find(
        (x) => x.dashboardType === dashboardType && x.accessPointGroup === accessPointGroup
      );

      if (existing) {
        const existingAllowedActions = Array.isArray(existing.allowedActions)
          ? (existing.allowedActions as string[])
          : [];
        await db
          .update(dashboardAccessPoints)
          .set({
            accessPointName,
            accessPointDescription,
            allowedActions: allowedActions.length > 0 ? allowedActions : existingAllowedActions,
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

    const persistedPoints = await db
      .select({
        dashboardType: dashboardAccessPoints.dashboardType,
        accessPointGroup: dashboardAccessPoints.accessPointGroup,
        allowedActions: dashboardAccessPoints.allowedActions,
      })
      .from(dashboardAccessPoints)
      .where(and(eq(dashboardAccessPoints.systemUserId, userId), eq(dashboardAccessPoints.isActive, true)));
    console.info("[PUT /api/users/[id]/access] persisted summary", {
      userId,
      activeAccessPointsCount: persistedPoints.length,
      hasTicketAgentStatusToggle: persistedPoints.some(
        (p) =>
          String(p.dashboardType).trim().toUpperCase() === "TICKET" &&
          String(p.accessPointGroup).trim().toUpperCase() === "TICKET_AGENT_STATUS_TOGGLE"
      ),
    });

    await logActionByAuth(authUser.id, authUser.email ?? "", "SYSTEM", "UPDATE", {
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
