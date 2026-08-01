import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveAnalyticsAccessByAuth } from "@/lib/analytics/analytics-scope";
import {
  getAgentDailyAnalytics,
  listAgentAnalytics,
  resolveAnalyticsDateRange,
  type AnalyticsPeriod,
} from "@/lib/analytics/agent-analytics";
import { resolveAnalyticsDisplayName } from "@/lib/analytics/display-name";
import { getDb } from "@/lib/db/client";
import { systemUsers } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/analytics/agents/[id]
 * Day-by-day agent analytics detail table.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const access = await resolveAnalyticsAccessByAuth(user.id, user.email);
    if (!access) {
      return NextResponse.json(
        { success: false, error: "Analytics access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const agentId = Number(id);
    if (!Number.isFinite(agentId) || agentId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid agent id" }, { status: 400 });
    }

    if (access.scope === "OWN" && agentId !== access.systemUserId) {
      return NextResponse.json(
        { success: false, error: "Own Record access: you can only view your own analytics" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "month") as AnalyticsPeriod;
    const range = resolveAnalyticsDateRange(
      period,
      searchParams.get("startDate"),
      searchParams.get("endDate")
    );

    const db = getDb();
    const [agent] = await db
      .select({
        id: systemUsers.id,
        systemUserId: systemUsers.systemUserId,
        fullName: systemUsers.fullName,
        firstName: systemUsers.firstName,
        lastName: systemUsers.lastName,
        email: systemUsers.email,
        primaryRole: systemUsers.primaryRole,
      })
      .from(systemUsers)
      .where(and(eq(systemUsers.id, agentId), isNull(systemUsers.deletedAt)))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const displayName = resolveAnalyticsDisplayName({
      fullName: agent.fullName,
      firstName: agent.firstName,
      lastName: agent.lastName,
      email: agent.email,
      systemUserId: agent.systemUserId,
    });

    const [summary] = await listAgentAnalytics({
      startTs: range.startTs,
      endTs: range.endTs,
      agentIds: [agentId],
    });

    const days = await getAgentDailyAnalytics({
      agentId,
      startTs: range.startTs,
      endTs: range.endTs,
    });

    return NextResponse.json({
      success: true,
      data: {
        scope: access.scope,
        period,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        agent: {
          userId: agent.id,
          systemUserId: agent.systemUserId,
          fullName: displayName,
          email: agent.email,
          primaryRole: agent.primaryRole,
        },
        summary: summary
          ? { ...summary, fullName: displayName }
          : {
              userId: agent.id,
              systemUserId: agent.systemUserId,
              fullName: displayName,
              email: agent.email,
              primaryRole: String(agent.primaryRole ?? ""),
              workSeconds: 0,
              loginCount: 0,
              logoutCount: 0,
              ticketsWorked: 0,
              ticketsResolved: 0,
              ticketsAssigned: 0,
              ordersWorked: 0,
            },
        days,
      },
    });
  } catch (error) {
    console.error("[GET /api/analytics/agents/[id]]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
