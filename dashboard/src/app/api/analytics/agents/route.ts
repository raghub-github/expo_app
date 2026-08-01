import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseAnalyticsCategory,
  resolveAnalyticsAccessByAuth,
  resolveTargetAgentIds,
} from "@/lib/analytics/analytics-scope";
import {
  listAgentAnalytics,
  resolveAnalyticsDateRange,
  sortAgentsForCategory,
  type AnalyticsPeriod,
} from "@/lib/analytics/agent-analytics";

export const runtime = "nodejs";

/**
 * GET /api/analytics/agents?category=agents|tickets|orders|sessions
 * Agent list for a category (Own → self only; Overall → all).
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const category = parseAnalyticsCategory(searchParams.get("category")) ?? "agents";
    const period = (searchParams.get("period") || "month") as AnalyticsPeriod;
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const range = resolveAnalyticsDateRange(
      period,
      searchParams.get("startDate"),
      searchParams.get("endDate")
    );

    const agentIds = resolveTargetAgentIds(access.scope, access.systemUserId, null);
    let agents = await listAgentAnalytics({
      startTs: range.startTs,
      endTs: range.endTs,
      agentIds,
    });

    agents = sortAgentsForCategory(agents, category);

    if (q) {
      agents = agents.filter(
        (a) =>
          a.fullName.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.systemUserId.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        category,
        scope: access.scope,
        period,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        viewerSystemUserId: access.systemUserId,
        agents,
        count: agents.length,
      },
    });
  } catch (error) {
    console.error("[GET /api/analytics/agents]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
