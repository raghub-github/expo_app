import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { canPerformActionByAuth } from "@/lib/permissions/actions";

/**
 * GET /api/agents/activity
 * Get agent activity stats (tickets handled, CSAT/DSAT, time online, etc.)
 * Query params: startDate, endDate, period (today, week, month, custom), agentUserId (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Check if user has ticket action permissions
    const hasTicketEditAccess = await canPerformActionByAuth(
      user.id,
      user.email!,
      "TICKET",
      "UPDATE"
    ) || await canPerformActionByAuth(
      user.id,
      user.email!,
      "TICKET",
      "ASSIGN"
    );

    if (!hasTicketEditAccess) {
      return NextResponse.json(
        { success: false, error: "You don't have permission to view activity" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const agentUserIdParam = searchParams.get("agentUserId");

    // When provided, show activity for a specific agent. When missing, default to ALL agents.
    const targetAgentUserId = (() => {
      if (!agentUserIdParam) return null;
      const n = Number(agentUserIdParam);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    })();

    const sqlClient = getSql();
    let startDate: Date;
    let endDate: Date = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Calculate date range based on period
    if (period === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "custom") {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { success: false, error: "Custom period requires startDate and endDate (YYYY-MM-DD)" },
          { status: 400 }
        );
      }
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];
    const startTs = startDate.toISOString();
    const endTs = endDate.toISOString();

    // For ALL agents mode we only need totals (no per-agent breakdown tables).
    const activityLogsResult =
      targetAgentUserId != null
        ? await sqlClient`
      SELECT 
        activity_date,
        online_time_minutes,
        break_time_minutes,
        busy_time_minutes,
        active_time_minutes,
        tickets_assigned,
        tickets_resolved,
        tickets_closed,
        tickets_reopened,
        tickets_updated,
        tickets_replied,
        avg_first_response_time_minutes,
        avg_resolution_time_minutes,
        csat_score,
        dsat_count,
        csat_count,
        service_breakdown
      FROM agent_activity_logs
      WHERE agent_user_id = ${targetAgentUserId}
        AND activity_date >= ${startDateStr}
        AND activity_date <= ${endDateStr}
      ORDER BY activity_date DESC
    `
        : [];

    const statusSegmentsResult =
      targetAgentUserId != null
        ? await sqlClient`
      SELECT
        id,
        status,
        started_at,
        ended_at,
        duration_minutes,
        reason,
        change_source,
        changed_by_user_id
      FROM agent_status_segments
      WHERE agent_user_id = ${targetAgentUserId}
        AND ended_at >= ${startTs}::timestamptz
        AND started_at <= ${endTs}::timestamptz
      ORDER BY started_at DESC
      LIMIT 500
    `
        : [];

    const dailyTransitionsResult =
      targetAgentUserId != null
        ? await sqlClient`
      SELECT
        (timezone('UTC', changed_at))::date AS day,
        COUNT(*) FILTER (WHERE status = 'online')::int AS to_online,
        COUNT(*) FILTER (WHERE status = 'offline')::int AS to_offline,
        COUNT(*) FILTER (WHERE status = 'break')::int AS to_break,
        COUNT(*) FILTER (WHERE status = 'busy')::int AS to_busy
      FROM agent_availability_logs
      WHERE agent_user_id = ${targetAgentUserId}
        AND changed_at >= ${startTs}::timestamptz
        AND changed_at <= ${endTs}::timestamptz
      GROUP BY 1
      ORDER BY 1 DESC
    `
        : [];

    // Get current profile stats (agent mode only; all-agents mode returns null)
    const profileResult =
      targetAgentUserId != null
        ? await sqlClient`
      SELECT 
        total_online_time_minutes,
        total_break_time_minutes,
        total_tickets_resolved,
        csat_avg_score,
        avg_resolution_time_minutes,
        avg_first_response_time_minutes
      FROM agent_profiles
      WHERE user_id = ${targetAgentUserId}
      LIMIT 1
    `
        : [];

    // Ticket metrics from unified_tickets (per-agent or all-agents totals)
    const ticketStatsResult = await sqlClient`
      SELECT 
        COUNT(*) FILTER (WHERE assigned_at IS NOT NULL AND assigned_at >= ${startTs}::timestamptz AND assigned_at <= ${endTs}::timestamptz)::int as total_assigned,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= ${startTs}::timestamptz AND resolved_at <= ${endTs}::timestamptz)::int as resolved,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND closed_at >= ${startTs}::timestamptz AND closed_at <= ${endTs}::timestamptz)::int as closed,
        COUNT(*) FILTER (WHERE reopened_at IS NOT NULL AND reopened_at >= ${startTs}::timestamptz AND reopened_at <= ${endTs}::timestamptz)::int as reopened,
        COUNT(*) FILTER (WHERE updated_at >= ${startTs}::timestamptz AND updated_at <= ${endTs}::timestamptz)::int as updated
      FROM public.unified_tickets ut
      WHERE
        ut.assigned_to_agent_id IS NOT NULL
        AND (${targetAgentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${targetAgentUserId})
    `;

    const ratingsResult = await sqlClient`
      SELECT 
        COUNT(*) FILTER (WHERE satisfaction_rating >= 4)::int as csat_count,
        COUNT(*) FILTER (WHERE satisfaction_rating <= 2)::int as dsat_count,
        AVG(satisfaction_rating)::numeric as avg_rating
      FROM public.unified_tickets ut
      WHERE
        ut.satisfaction_rating IS NOT NULL
        AND ut.satisfaction_collected_at IS NOT NULL
        AND ut.satisfaction_collected_at >= ${startTs}::timestamptz
        AND ut.satisfaction_collected_at <= ${endTs}::timestamptz
        AND (${targetAgentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${targetAgentUserId})
    `;

    const aggregatedFromLogs = (rows: any[]) =>
      rows.reduce(
        (acc, log) => {
          acc.onlineTimeMinutes += Number(log.online_time_minutes) || 0;
          acc.breakTimeMinutes += Number(log.break_time_minutes) || 0;
          acc.busyTimeMinutes += Number(log.busy_time_minutes) || 0;
          acc.activeTimeMinutes += Number(log.active_time_minutes) || 0;
          return acc;
        },
        {
          onlineTimeMinutes: 0,
          breakTimeMinutes: 0,
          busyTimeMinutes: 0,
          activeTimeMinutes: 0,
        }
      );

    const aggregated =
      targetAgentUserId != null
        ? aggregatedFromLogs(activityLogsResult as any[])
        : ((await sqlClient`
      SELECT
        COALESCE(SUM(online_time_minutes), 0)::int as online_time_minutes,
        COALESCE(SUM(break_time_minutes), 0)::int as break_time_minutes,
        COALESCE(SUM(busy_time_minutes), 0)::int as busy_time_minutes,
        COALESCE(SUM(active_time_minutes), 0)::int as active_time_minutes
      FROM public.agent_activity_logs
      WHERE activity_date >= ${startDateStr}::date AND activity_date <= ${endDateStr}::date
    `)[0] ?? {
            online_time_minutes: 0,
            break_time_minutes: 0,
            busy_time_minutes: 0,
            active_time_minutes: 0,
          });

    const profilesAgg =
      targetAgentUserId != null
        ? await sqlClient`
      SELECT
        COALESCE(MAX(total_online_time_minutes), 0)::int as total_online_time_minutes,
        COALESCE(MAX(total_break_time_minutes), 0)::int as total_break_time_minutes,
        COALESCE(MAX(total_busy_time_minutes), 0)::int as total_busy_time_minutes
      FROM public.agent_profiles
      WHERE user_id = ${targetAgentUserId}
    `
        : await sqlClient`
      SELECT
        COALESCE(SUM(total_online_time_minutes), 0)::int as total_online_time_minutes,
        COALESCE(SUM(total_break_time_minutes), 0)::int as total_break_time_minutes,
        COALESCE(SUM(total_busy_time_minutes), 0)::int as total_busy_time_minutes
      FROM public.agent_profiles
    `;

    const profilesAggRow = (profilesAgg as any[])[0] ?? {
      total_online_time_minutes: 0,
      total_break_time_minutes: 0,
      total_busy_time_minutes: 0,
    };
    const timeFallbackOnline = Number(profilesAggRow.total_online_time_minutes) || 0;
    const timeFallbackBreak = Number(profilesAggRow.total_break_time_minutes) || 0;
    const timeFallbackBusy = Number(profilesAggRow.total_busy_time_minutes) || 0;

    const ticketStats = ticketStatsResult[0] || {};
    const ratings = ratingsResult[0] || {};

    // All agents' activity for the period (same permission: anyone with ticket access can see)
    const allAgentsActivityResult = await sqlClient`
      SELECT 
        ap.user_id,
        su.full_name,
        su.email,
        COALESCE(SUM(aal.online_time_minutes), 0)::int as online_time_minutes,
        COALESCE(SUM(aal.break_time_minutes), 0)::int as break_time_minutes,
        COALESCE(SUM(aal.busy_time_minutes), 0)::int as busy_time_minutes,
        (COALESCE(SUM(aal.online_time_minutes), 0) + COALESCE(SUM(aal.busy_time_minutes), 0))::int as working_time_minutes,
        0::int as tickets_resolved,
        0::int as tickets_closed,
        0::int as tickets_assigned,
        0::int as tickets_updated,
        0::int as tickets_reopened
      FROM agent_profiles ap
      JOIN system_users su ON su.id = ap.user_id
      LEFT JOIN agent_activity_logs aal ON aal.agent_user_id = ap.user_id
        AND aal.activity_date >= ${startDateStr}
        AND aal.activity_date <= ${endDateStr}
      GROUP BY ap.user_id, su.full_name, su.email
      ORDER BY online_time_minutes DESC, tickets_resolved DESC
    `;

    const unifiedTicketCountsByAgent = await sqlClient`
      SELECT
        ut.assigned_to_agent_id::bigint as user_id,
        COUNT(*) FILTER (WHERE ut.assigned_at IS NOT NULL AND ut.assigned_at >= ${startTs}::timestamptz AND ut.assigned_at <= ${endTs}::timestamptz)::int as tickets_assigned,
        COUNT(*) FILTER (WHERE ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${startTs}::timestamptz AND ut.resolved_at <= ${endTs}::timestamptz)::int as tickets_resolved,
        COUNT(*) FILTER (WHERE ut.closed_at IS NOT NULL AND ut.closed_at >= ${startTs}::timestamptz AND ut.closed_at <= ${endTs}::timestamptz)::int as tickets_closed,
        COUNT(*) FILTER (WHERE ut.reopened_at IS NOT NULL AND ut.reopened_at >= ${startTs}::timestamptz AND ut.reopened_at <= ${endTs}::timestamptz)::int as tickets_reopened,
        COUNT(*) FILTER (WHERE ut.updated_at >= ${startTs}::timestamptz AND ut.updated_at <= ${endTs}::timestamptz)::int as tickets_updated
      FROM public.unified_tickets ut
      WHERE
        ut.assigned_to_agent_id IS NOT NULL
      GROUP BY 1
    `;

    const ticketsByAgent = new Map<number, { assigned: number; resolved: number; closed: number; reopened: number; updated: number }>(
      (unifiedTicketCountsByAgent as any[]).map((r) => [
        Number(r.user_id),
        {
          assigned: Number(r.tickets_assigned) || 0,
          resolved: Number(r.tickets_resolved) || 0,
          closed: Number(r.tickets_closed) || 0,
          reopened: Number(r.tickets_reopened) || 0,
          updated: Number(r.tickets_updated) || 0,
        },
      ])
    );

    const allAgents = allAgentsActivityResult.map((row: Record<string, unknown>) => {
      const id = Number(row.user_id);
      const t = ticketsByAgent.get(id);
      return {
        userId: id,
        name: row.full_name || row.email || `User ${row.user_id}`,
        email: row.email || "",
        onlineTimeMinutes: Number(row.online_time_minutes) || 0,
        breakTimeMinutes: Number(row.break_time_minutes) || 0,
        busyTimeMinutes: Number(row.busy_time_minutes) || 0,
        workingTimeMinutes: Number(row.working_time_minutes) || 0,
        ticketsResolved: t?.resolved ?? 0,
        ticketsClosed: t?.closed ?? 0,
        ticketsAssigned: t?.assigned ?? 0,
        ticketsUpdated: t?.updated ?? 0,
        ticketsReopened: t?.reopened ?? 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: {
          onlineTimeMinutes:
            Number((aggregated as any).onlineTimeMinutes ?? (aggregated as any).online_time_minutes) || timeFallbackOnline,
          breakTimeMinutes:
            Number((aggregated as any).breakTimeMinutes ?? (aggregated as any).break_time_minutes) || timeFallbackBreak,
          busyTimeMinutes:
            Number((aggregated as any).busyTimeMinutes ?? (aggregated as any).busy_time_minutes) || timeFallbackBusy,
          activeTimeMinutes:
            Number((aggregated as any).activeTimeMinutes ?? (aggregated as any).active_time_minutes) || (timeFallbackOnline + timeFallbackBusy),
          ticketsAssigned: Number(ticketStats.total_assigned) || 0,
          ticketsResolved: Number(ticketStats.resolved) || 0,
          ticketsClosed: Number(ticketStats.closed) || 0,
          ticketsReopened: Number(ticketStats.reopened) || 0,
          ticketsUpdated: Number(ticketStats.updated) || 0,
          csatCount: Number(ratings.csat_count) || 0,
          dsatCount: Number(ratings.dsat_count) || 0,
          avgRating: ratings.avg_rating != null ? Number(ratings.avg_rating) : null,
        },
        profile: profileResult[0] || null,
        dailyBreakdown: activityLogsResult,
        statusSegments: statusSegmentsResult,
        dailyTransitions: dailyTransitionsResult,
        allAgents,
      },
    });
  } catch (error) {
    console.error("Error fetching agent activity:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch agent activity" },
      { status: 500 }
    );
  }
}
