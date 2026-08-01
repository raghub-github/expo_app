import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveAnalyticsAccessByAuth } from "@/lib/analytics/analytics-scope";
import {
  getAgentDayAudit,
  getAgentDayOrders,
  getAgentDaySessions,
  getAgentDayTickets,
  type AgentDayDetailType,
} from "@/lib/analytics/agent-analytics";
import { resolveAnalyticsDisplayName } from "@/lib/analytics/display-name";
import { getDb } from "@/lib/db/client";
import { systemUsers } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/analytics/agents/[id]/day?day=YYYY-MM-DD&type=audit|sessions|tickets|orders
 * Day-level drill-down / complete day audit for agent analytics.
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
    const day = (searchParams.get("day") || "").trim();
    const type = ((searchParams.get("type") || "audit").trim() || "audit") as AgentDayDetailType;

    if (!DAY_RE.test(day)) {
      return NextResponse.json(
        { success: false, error: "day must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (type !== "sessions" && type !== "tickets" && type !== "orders" && type !== "audit") {
      return NextResponse.json(
        { success: false, error: "type must be audit, sessions, tickets, or orders" },
        { status: 400 }
      );
    }

    if (type === "sessions") {
      const detail = await getAgentDaySessions(agentId, day);
      return NextResponse.json({ success: true, data: { day, type, ...detail } });
    }
    if (type === "tickets") {
      const tickets = await getAgentDayTickets(agentId, day);
      return NextResponse.json({ success: true, data: { day, type, tickets } });
    }
    if (type === "orders") {
      const orders = await getAgentDayOrders(agentId, day);
      return NextResponse.json({ success: true, data: { day, type, orders } });
    }

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

    const audit = await getAgentDayAudit(agentId, day);
    return NextResponse.json({
      success: true,
      data: {
        type: "audit",
        scope: access.scope,
        agent: {
          userId: agent.id,
          systemUserId: agent.systemUserId,
          fullName: resolveAnalyticsDisplayName({
            fullName: agent.fullName,
            firstName: agent.firstName,
            lastName: agent.lastName,
            email: agent.email,
            systemUserId: agent.systemUserId,
          }),
          email: agent.email,
          primaryRole: agent.primaryRole,
        },
        ...audit,
      },
    });
  } catch (error) {
    console.error("[GET /api/analytics/agents/[id]/day]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
