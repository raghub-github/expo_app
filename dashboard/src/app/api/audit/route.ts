/**
 * Audit Log API Route
 * GET /api/audit - Get audit logs with filtering and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { actionAuditLog } from "@/lib/db/schema";
import { eq, and, or, ilike, gte, lte, desc, sql } from "drizzle-orm";

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

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required" },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    const filters: any[] = [];

    // Search filter
    const search = searchParams.get("search");
    if (search) {
      filters.push(
        or(
          ilike(actionAuditLog.agentEmail, `%${search}%`),
          ilike(actionAuditLog.agentName, `%${search}%`),
          ilike(actionAuditLog.resourceId, `%${search}%`)
        )!
      );
    }

    // Dashboard type filter
    const dashboardType = searchParams.get("dashboardType");
    if (dashboardType) {
      filters.push(eq(actionAuditLog.dashboardType, dashboardType));
    }

    // Action type filter
    const actionType = searchParams.get("actionType");
    if (actionType) {
      filters.push(eq(actionAuditLog.actionType, actionType));
    }

    // Agent ID filter
    const agentId = searchParams.get("agentId");
    if (agentId) {
      filters.push(eq(actionAuditLog.agentId, parseInt(agentId)));
    }

    // Date range filters
    const dateFrom = searchParams.get("dateFrom");
    if (dateFrom) {
      filters.push(gte(actionAuditLog.createdAt, new Date(dateFrom)));
    }

    const dateTo = searchParams.get("dateTo");
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      filters.push(lte(actionAuditLog.createdAt, endDate));
    }

    const db = getDb();

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(actionAuditLog)
      .where(filters.length > 0 ? and(...filters) : undefined);

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get logs
    const logs = await db
      .select()
      .from(actionAuditLog)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(actionAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: logs.map(log => ({
        id: log.id,
        agentId: log.agentId,
        agentEmail: log.agentEmail,
        agentName: log.agentName,
        agentRole: log.agentRole,
        dashboardType: log.dashboardType,
        actionType: log.actionType,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        actionDetails: log.actionDetails,
        previousValues: log.previousValues,
        newValues: log.newValues,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        requestPath: log.requestPath,
        requestMethod: log.requestMethod,
        actionStatus: log.actionStatus,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[GET /api/audit] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
