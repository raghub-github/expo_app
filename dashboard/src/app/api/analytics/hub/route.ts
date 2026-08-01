import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveAnalyticsAccessByAuth, resolveTargetAgentIds } from "@/lib/analytics/analytics-scope";
import {
  getAnalyticsHubSummary,
  resolveAnalyticsDateRange,
  type AnalyticsPeriod,
} from "@/lib/analytics/agent-analytics";

export const runtime = "nodejs";

/**
 * GET /api/analytics/hub
 * Category cards for Agent Analytics (Agents / Tickets / Orders / Sessions).
 * Scoped by Own Record vs Overall User Record.
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
    const period = (searchParams.get("period") || "month") as AnalyticsPeriod;
    const range = resolveAnalyticsDateRange(
      period,
      searchParams.get("startDate"),
      searchParams.get("endDate")
    );

    const agentIds = resolveTargetAgentIds(access.scope, access.systemUserId, null);
    const data = await getAnalyticsHubSummary({
      startTs: range.startTs,
      endTs: range.endTs,
      agentIds,
      scope: access.scope,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        period,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        viewerSystemUserId: access.systemUserId,
      },
    });
  } catch (error) {
    console.error("[GET /api/analytics/hub]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
