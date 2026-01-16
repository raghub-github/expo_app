/**
 * User Management API Routes
 * GET /api/users/[id] - Get user details
 * PUT /api/users/[id] - Update user
 * DELETE /api/users/[id] - Delete user (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSystemUserById,
  getSystemUserByEmail,
  updateSystemUser,
  deleteSystemUser,
  activateSystemUser,
  deactivateSystemUser,
} from "@/lib/db/operations/users";
import { checkPermission } from "@/lib/permissions/engine";
import { logAPICall, logUserAction } from "@/lib/auth/activity-tracker";
import {
  logUserUpdate,
  logUserDeletion,
  logUserActivation,
  logUserDeactivation,
} from "@/lib/audit/audit-logger";
import { logActionByAuth } from "@/lib/audit/logger";
import { getDb } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = 'nodejs';

/**
 * GET /api/users/[id]
 * Get user details
 */
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

    // Check permission
    const hasPermission = await checkPermission(
      session.user.id,
      session.user.email!,
      "USERS",
      "VIEW"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
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

    const user = await getSystemUserById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("[GET /api/users/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id]
 * Update user
 */
export async function PUT(
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

    // Get system user for super admin check
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Check if user is super admin for role/status updates
    const { isSuperAdmin } = await import("@/lib/permissions/engine");
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);

    // Check permission
    const hasPermission = await checkPermission(
      session.user.id,
      session.user.email!,
      "USERS",
      "UPDATE"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
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

    // Get current user data for audit
    const oldUser = await getSystemUserById(userId);
    if (!oldUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    let { 
      dashboardAccess: dashboardAccessData, 
      accessPoints: accessPointsData,
      subrole,
      subrole_other,
      ...updates 
    } = body;
    
    // Handle subrole fields separately
    if (subrole !== undefined) {
      updates.subrole = subrole;
    }
    if (subrole === "OTHER" && subrole_other !== undefined) {
      updates.subroleOther = subrole_other;
    } else if (subrole !== "OTHER") {
      updates.subroleOther = null; // Clear subrole_other if not "OTHER"
    }

    // Normalize mobile numbers if provided
    const { normalizeMobileNumber } = await import("@/lib/utils/mobile-normalizer");
    if (updates.mobile) {
      updates.mobile = normalizeMobileNumber(updates.mobile);
    }
    if (updates.alternate_mobile) {
      updates.alternate_mobile = normalizeMobileNumber(updates.alternate_mobile);
    }

    if (updates.primary_role === "SUPER_ADMIN") {
      const { DASHBOARD_DEFINITIONS } = await import("@/components/users/DashboardAccessSelector");
      const dashboards = Object.keys(DASHBOARD_DEFINITIONS);

      dashboardAccessData = dashboards.map((dashboardType) => ({
        dashboardType,
        accessLevel: "FULL_ACCESS",
      }));

      accessPointsData = dashboards.flatMap((dashboardType) =>
        DASHBOARD_DEFINITIONS[dashboardType as keyof typeof DASHBOARD_DEFINITIONS].accessPoints.map((ap) => ({
          dashboardType,
          accessPointGroup: ap.group,
        }))
      );
    }

    // Prevent super admin from changing their own role
    if (updates.primary_role !== undefined && userId === systemUser.id) {
      if (oldUser.primaryRole === "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "Super admins cannot change their own role for security reasons" },
          { status: 403 }
        );
      }
    }

    // If updating role or status, require super admin
    if (updates.primary_role !== undefined || updates.status !== undefined) {
      if (!userIsSuperAdmin) {
        return NextResponse.json(
          { success: false, error: "Super admin access required to update role or status" },
          { status: 403 }
        );
      }
      // Set approved_by and approved_at when super admin updates role/status
      updates.approved_by = systemUser.id;
      updates.approved_at = new Date();
    }

    // If role is being changed, regenerate system_user_id
    if (updates.primary_role !== undefined && updates.primary_role !== oldUser.primaryRole) {
      const { generateSystemUserId } = await import("@/lib/utils/user-id-generator");
      const newSystemUserId = await generateSystemUserId(updates.primary_role);
      updates.system_user_id = newSystemUserId;
    }

    // Update user
    const updatedUser = await updateSystemUser(userId, updates);

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: "Failed to update user" },
        { status: 500 }
      );
    }

    // Calculate changed fields
    const changedFields: string[] = [];
    Object.keys(updates).forEach((key) => {
      if (oldUser[key as keyof typeof oldUser] !== updatedUser[key as keyof typeof updatedUser]) {
        changedFields.push(key);
      }
    });

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logUserAction(
      systemUser.id,
      "UPDATE",
      "USER",
      userId.toString(),
      true,
      { changedFields },
      ipAddress
    );

    await logUserUpdate(
      systemUser.id,
      userId,
      oldUser,
      updatedUser,
      changedFields,
      ipAddress
    );

    // Update dashboard access if provided and user is super admin
    if (userIsSuperAdmin && (dashboardAccessData || accessPointsData)) {
      const db = getDb();

      // Update dashboard access
      if (dashboardAccessData && Array.isArray(dashboardAccessData)) {
        // Get current dashboard access
        const currentAccess = await db
          .select()
          .from(dashboardAccess)
          .where(eq(dashboardAccess.systemUserId, userId));

        const currentTypes = new Set(currentAccess.map(a => a.dashboardType));
        const newTypes = new Set(dashboardAccessData.map((a: any) => a.dashboardType));

        // Remove access for dashboards not in new list
        for (const current of currentAccess) {
          if (!newTypes.has(current.dashboardType)) {
            await db
              .update(dashboardAccess)
              .set({
                isActive: false,
                revokedAt: new Date(),
                revokedBy: systemUser.id,
                revokeReason: "Removed by super admin",
              })
              .where(
                and(
                  eq(dashboardAccess.systemUserId, userId),
                  eq(dashboardAccess.dashboardType, current.dashboardType)
                )
              );
          }
        }

        // Add or update access for dashboards in new list
        for (const access of dashboardAccessData) {
          const existing = currentAccess.find(a => a.dashboardType === access.dashboardType);
          if (existing) {
            await db
              .update(dashboardAccess)
              .set({
                accessLevel: access.accessLevel || "FULL_ACCESS",
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
              dashboardType: access.dashboardType,
              accessLevel: access.accessLevel || "FULL_ACCESS",
              isActive: true,
              grantedBy: systemUser.id,
              grantedByName: systemUser.fullName,
            });
          }
        }
      }

      // Update access points
      if (accessPointsData && Array.isArray(accessPointsData)) {
        // Get current access points
        const currentPoints = await db
          .select()
          .from(dashboardAccessPoints)
          .where(eq(dashboardAccessPoints.systemUserId, userId));

        // Create a map of current points by dashboard and group
        const currentPointsMap = new Map(
          currentPoints.map(p => [`${p.dashboardType}:${p.accessPointGroup}`, p])
        );

        // Get access point definitions
        const { DASHBOARD_DEFINITIONS } = await import("@/components/users/DashboardAccessSelector");

        // Process new access points
        const newPointsMap = new Map<string, any>();
        for (const accessPoint of accessPointsData) {
          const key = `${accessPoint.dashboardType}:${accessPoint.accessPointGroup}`;
          newPointsMap.set(key, accessPoint);
        }

        // Remove access points not in new list
        for (const [key, currentPoint] of currentPointsMap) {
          if (!newPointsMap.has(key)) {
            await db
              .update(dashboardAccessPoints)
              .set({
                isActive: false,
                revokedAt: new Date(),
                revokedBy: systemUser.id,
                revokeReason: "Removed by super admin",
              })
              .where(eq(dashboardAccessPoints.id, currentPoint.id));
          }
        }

        // Add or update access points in new list
        for (const [key, accessPoint] of newPointsMap) {
          const existing = currentPointsMap.get(key);
          
          // Get access point definition
          let accessPointName = accessPoint.accessPointGroup;
          let accessPointDescription = "";
          let allowedActions: string[] = [];
          let context: Record<string, any> = {};

          if (DASHBOARD_DEFINITIONS && DASHBOARD_DEFINITIONS[accessPoint.dashboardType]) {
            const def = DASHBOARD_DEFINITIONS[accessPoint.dashboardType].accessPoints.find(
              (ap: any) => ap.group === accessPoint.accessPointGroup
            );
            if (def) {
              accessPointName = def.label;
              accessPointDescription = def.description;
              allowedActions = def.allowedActions;
            }
          }

          // Add context for ticket access points
          if (accessPoint.dashboardType === "TICKET") {
            // Extract ticket category from access point group
            if (accessPoint.accessPointGroup === "TICKET_MERCHANT") {
              context.ticket_category = "MERCHANT";
            } else if (accessPoint.accessPointGroup === "TICKET_CUSTOMER") {
              context.ticket_category = "CUSTOMER";
            } else if (accessPoint.accessPointGroup === "TICKET_RIDER") {
              context.ticket_category = "RIDER";
            } else if (accessPoint.accessPointGroup === "TICKET_OTHER") {
              context.ticket_category = "OTHER";
            }
            
            // If context is provided in the request, use it
            if (accessPoint.context) {
              context = { ...context, ...accessPoint.context };
            }
          }

          if (existing) {
            await db
              .update(dashboardAccessPoints)
              .set({
                accessPointName,
                accessPointDescription,
                allowedActions,
                context: Object.keys(context).length > 0 ? context : undefined,
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
              dashboardType: accessPoint.dashboardType,
              accessPointGroup: accessPoint.accessPointGroup,
              accessPointName,
              accessPointDescription,
              allowedActions,
              context: Object.keys(context).length > 0 ? context : undefined,
              isActive: true,
              grantedBy: systemUser.id,
              grantedByName: systemUser.fullName,
            });
          }
        }
      }
    }

    // Audit log (action_audit_log)
    await logActionByAuth(session.user.id, session.user.email!, "SYSTEM", "UPDATE", {
      resourceType: "USER",
      resourceId: userId.toString(),
      actionDetails: {
        changedFields,
        dashboardAccessProvided: Array.isArray(dashboardAccessData),
        dashboardAccessCount: Array.isArray(dashboardAccessData) ? dashboardAccessData.length : 0,
        accessPointsProvided: Array.isArray(accessPointsData),
        accessPointsCount: Array.isArray(accessPointsData) ? accessPointsData.length : 0,
        systemUserIdChanged: updates.system_user_id !== undefined,
        newSystemUserId: updates.system_user_id,
      },
      requestPath: `/api/users/${userId}`,
      requestMethod: "PUT",
    });

    // Refetch updated user with all relations to return complete data
    // Use the already imported function instead of dynamic import
    const refreshedUser = await getSystemUserById(userId);

    return NextResponse.json({
      success: true,
      data: refreshedUser || updatedUser,
    });
  } catch (error) {
    console.error("[PUT /api/users/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 * Soft delete user
 */
export async function DELETE(
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

    // Check permission
    const hasPermission = await checkPermission(
      session.user.id,
      session.user.email!,
      "USERS",
      "DELETE"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
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

    // Get system user ID for logging
    const { getSystemUserByEmail } = await import("@/lib/db/operations/users");
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Delete user
    const deletedUser = await deleteSystemUser(userId, systemUser.id);

    if (!deletedUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logUserAction(
      systemUser.id,
      "DELETE",
      "USER",
      userId.toString(),
      true,
      {},
      ipAddress
    );

    await logUserDeletion(
      systemUser.id,
      userId,
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: deletedUser,
    });
  } catch (error) {
    console.error("[DELETE /api/users/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
