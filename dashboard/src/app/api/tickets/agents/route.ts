/**
 * GET /api/tickets/agents
 * List all agents (system users) who have TICKET dashboard access (view or action).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getDb, getSql } from "@/lib/db/client";
import { dashboardAccess, dashboardAccessPoints, systemUsers } from "@/lib/db/schema";
import { and, eq, inArray, asc, or, isNotNull } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "TICKET"
    );

    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const db = getDb();

    // Get users with TICKET dashboard access
    const accessRows = await db
      .select({ systemUserId: dashboardAccess.systemUserId })
      .from(dashboardAccess)
      .where(
        and(
          eq(dashboardAccess.dashboardType, "TICKET"),
          eq(dashboardAccess.isActive, true)
        )
      );

    console.log("[GET /api/tickets/agents] Dashboard access rows:", accessRows.length);

    // Also get users with TICKET access points (VIEW or ACTION)
    const accessPointRows = await db
      .select({ systemUserId: dashboardAccessPoints.systemUserId })
      .from(dashboardAccessPoints)
      .where(
        and(
          eq(dashboardAccessPoints.dashboardType, "TICKET"),
          eq(dashboardAccessPoints.isActive, true)
        )
      );

    console.log("[GET /api/tickets/agents] Access point rows:", accessPointRows.length);

    // Combine both sets of user IDs
    const userIdsFromAccess = accessRows.map((r) => r.systemUserId);
    const userIdsFromAccessPoints = accessPointRows.map((r) => r.systemUserId);
    let userIds = [...new Set([...userIdsFromAccess, ...userIdsFromAccessPoints])];
    
    console.log("[GET /api/tickets/agents] Combined user IDs from access:", userIds.length, userIds);
    
    // Also include agents who are currently assigned to tickets
    // This ensures agents working on tickets appear in the dropdown even if they don't have explicit access records
    const sqlClient = getSql();
    const assignedAgentsResult = await sqlClient`
      SELECT DISTINCT current_assignee_user_id
      FROM tickets
      WHERE current_assignee_user_id IS NOT NULL
    `;
    const assignedAgentIds = assignedAgentsResult
      .map((r: any) => r.current_assignee_user_id)
      .filter((id: any): id is number => id !== null && typeof id === 'number');
    
    // Merge assigned agents with access-based agents
    userIds = [...new Set([...userIds, ...assignedAgentIds])];
    console.log("[GET /api/tickets/agents] Final combined user IDs (including assigned):", userIds.length, userIds);
    
    if (userIds.length === 0) {
      console.log("[GET /api/tickets/agents] No agents found");
      return NextResponse.json({
        success: true,
        data: { agents: [] },
      });
    }

    const users = await db
      .select({
        id: systemUsers.id,
        fullName: systemUsers.fullName,
        email: systemUsers.email,
      })
      .from(systemUsers)
      .where(inArray(systemUsers.id, userIds))
      .orderBy(asc(systemUsers.fullName));

    const agents = users.map((u) => ({
      id: u.id,
      name: u.fullName ?? "",
      email: u.email ?? "",
    }));

    console.log("[GET /api/tickets/agents] Returning agents:", agents.length, agents.map(a => a.name || a.email));

    return NextResponse.json({
      success: true,
      data: { agents },
    });
  } catch (error) {
    console.error("[GET /api/tickets/agents] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
