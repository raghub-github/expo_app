/**
 * User Management API Routes
 * GET /api/users - List users
 * POST /api/users - Create user
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listSystemUsers, createSystemUser, getSystemUserByEmail } from "@/lib/db/operations/users";
import { checkPermission } from "@/lib/permissions/engine";
import { logAPICall, logUserAction } from "@/lib/auth/activity-tracker";
import { logUserCreation } from "@/lib/audit/audit-logger";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getDb } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = 'nodejs';

/**
 * GET /api/users
 * List users with filters and pagination
 */
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const filters = {
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
      search: searchParams.get("search") || undefined,
      role: searchParams.get("role") || undefined,
      status: searchParams.get("status") || undefined,
      department: searchParams.get("department") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
    };

    // Get system user ID
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Fetch users
    const result = await listSystemUsers(filters);

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      "/api/users",
      "GET",
      true,
      filters,
      { count: result.users.length },
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET /api/users] Error:", error);
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
 * POST /api/users
 * Create new user
 */
export async function POST(request: NextRequest) {
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
      "CREATE"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get system user ID
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Get IP address and user agent for logging
    const ipAddress = getIpAddress(request);
    const userAgent = getUserAgent(request);

    // Parse request body
    const body = await request.json();
    let {
      system_user_id,
      full_name,
      first_name,
      last_name,
      email,
      mobile,
      alternate_mobile,
      primary_role,
      subrole,
      subrole_other,
      role_display_name,
      department,
      team,
      reports_to_id,
      manager_name,
      dashboardAccess: dashboardAccessData,
      accessPoints: accessPointsData,
    } = body;

    // Normalize mobile numbers
    const { normalizeMobileNumber } = await import("@/lib/utils/mobile-normalizer");
    if (mobile) {
      mobile = normalizeMobileNumber(mobile);
    }
    if (alternate_mobile) {
      alternate_mobile = normalizeMobileNumber(alternate_mobile);
    }

    // Validate required fields
    if (!full_name || !email || !mobile || !primary_role) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (primary_role === "SUPER_ADMIN") {
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

    // Auto-generate system_user_id if not provided
    if (!system_user_id || system_user_id.trim() === "") {
      const { generateSystemUserId } = await import("@/lib/utils/user-id-generator");
      system_user_id = await generateSystemUserId(primary_role);
    }

    // Validate system_user_id is unique
    const { isSystemUserIdUnique } = await import("@/lib/utils/user-id-generator");
    const isUnique = await isSystemUserIdUnique(system_user_id);
    if (!isUnique) {
      return NextResponse.json(
        { success: false, error: "System User ID already exists" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await getSystemUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Create user
    const newUser = await createSystemUser({
      system_user_id,
      full_name,
      first_name,
      last_name,
      email,
      mobile,
      alternate_mobile,
      primary_role,
      subrole,
      subrole_other,
      role_display_name,
      department,
      team,
      reports_to_id,
      manager_name,
      created_by: systemUser.id,
      created_by_name: systemUser.fullName,
    });

    // Log activity
    await logUserAction(
      systemUser.id,
      "CREATE",
      "USER",
      newUser.id.toString(),
      true,
      { email, primary_role },
      ipAddress
    );

    await logUserCreation(
      systemUser.id,
      newUser.id,
      { email, full_name, primary_role },
      ipAddress
    );

    // Create dashboard access records if provided
    if (dashboardAccessData && Array.isArray(dashboardAccessData)) {
      const db = getDb();
      for (const access of dashboardAccessData) {
        await db.insert(dashboardAccess).values({
          systemUserId: newUser.id,
          dashboardType: access.dashboardType,
          accessLevel: access.accessLevel || "FULL_ACCESS",
          isActive: true,
          grantedBy: systemUser.id,
          grantedByName: systemUser.fullName,
        });
      }
    }

    // Create access point records if provided
    if (accessPointsData && Array.isArray(accessPointsData)) {
      const db = getDb();
      
      // Get access point definitions to get names and descriptions
      const { DASHBOARD_DEFINITIONS } = await import("@/components/users/DashboardAccessSelector");

      for (const accessPoint of accessPointsData) {
        // Find the access point definition
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

        await db.insert(dashboardAccessPoints).values({
          systemUserId: newUser.id,
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

    // Log user creation action to audit log
    await logActionByAuth(
      session.user.id,
      session.user.email!,
      "SYSTEM",
      "CREATE",
      {
        resourceType: "USER",
        resourceId: newUser.id.toString(),
        actionDetails: {
          email: newUser.email,
          fullName: newUser.fullName,
          primaryRole: newUser.primaryRole,
          dashboardAccessCount: dashboardAccessData?.length || 0,
          accessPointsCount: accessPointsData?.length || 0,
        },
        ipAddress,
        userAgent,
        requestPath: "/api/users",
        requestMethod: "POST",
        actionStatus: "SUCCESS",
      }
    );

    return NextResponse.json({
      success: true,
      data: newUser,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/users] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
