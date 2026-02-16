import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { canPerformActionByAuth } from "@/lib/permissions/actions";

/**
 * GET /api/agents/activity
 * Get agent activity stats (tickets handled, CSAT/DSAT, time online, etc.)
 * Query params: startDate, endDate, period (today, week, month, custom)
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
    } else if (period === "custom" && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }

    // Get activity logs for the date range
    const activityLogsResult = await sqlClient`
      SELECT 
        activity_date,
        online_time_minutes,
        break_time_minutes,
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
      WHERE agent_user_id = ${systemUser.id}
        AND activity_date >= ${startDate.toISOString().split('T')[0]}
        AND activity_date <= ${endDate.toISOString().split('T')[0]}
      ORDER BY activity_date DESC
    `;

    // Get current profile stats
    const profileResult = await sqlClient`
      SELECT 
        total_online_time_minutes,
        total_break_time_minutes,
        total_tickets_resolved,
        csat_avg_score,
        avg_resolution_time_minutes,
        avg_first_response_time_minutes
      FROM agent_profiles
      WHERE user_id = ${systemUser.id}
      LIMIT 1
    `;

    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    // Get ticket counts for the period (use ISO strings for timestamp comparison)
    const ticketStatsResult = await sqlClient`
      SELECT 
        COUNT(*) FILTER (WHERE current_assignee_user_id = ${systemUser.id}) as total_assigned,
        COUNT(*) FILTER (WHERE current_assignee_user_id = ${systemUser.id} AND status::text = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE current_assignee_user_id = ${systemUser.id} AND status::text = 'closed') as closed,
        COUNT(*) FILTER (WHERE current_assignee_user_id = ${systemUser.id} AND status::text = 'reopened') as reopened,
        COUNT(*) FILTER (WHERE current_assignee_user_id = ${systemUser.id} AND updated_at >= ${startStr}::timestamptz AND updated_at <= ${endStr}::timestamptz) as updated
      FROM tickets
      WHERE (current_assignee_user_id = ${systemUser.id} AND created_at >= ${startStr}::timestamptz AND created_at <= ${endStr}::timestamptz)
         OR (current_assignee_user_id = ${systemUser.id} AND updated_at >= ${startStr}::timestamptz AND updated_at <= ${endStr}::timestamptz)
    `;

    // Get CSAT/DSAT ratings for tickets resolved/closed by this agent
    const ratingsResult = await sqlClient`
      SELECT 
        COUNT(*) FILTER (WHERE rating_value >= 4) as csat_count,
        COUNT(*) FILTER (WHERE rating_value <= 2) as dsat_count,
        AVG(rating_value) FILTER (WHERE rating_value IS NOT NULL) as avg_rating
      FROM ticket_ratings tr
      JOIN tickets t ON tr.ticket_id = t.id
      WHERE t.current_assignee_user_id = ${systemUser.id}
        AND t.status::text IN ('resolved', 'closed')
        AND t.resolved_at >= ${startStr}::timestamptz
        AND t.resolved_at <= ${endStr}::timestamptz
    `;

    // Aggregate activity logs
    const aggregated = activityLogsResult.reduce((acc, log) => {
      acc.onlineTimeMinutes += log.online_time_minutes || 0;
      acc.breakTimeMinutes += log.break_time_minutes || 0;
      acc.activeTimeMinutes += log.active_time_minutes || 0;
      acc.ticketsAssigned += log.tickets_assigned || 0;
      acc.ticketsResolved += log.tickets_resolved || 0;
      acc.ticketsClosed += log.tickets_closed || 0;
      acc.ticketsReopened += log.tickets_reopened || 0;
      acc.ticketsUpdated += log.tickets_updated || 0;
      acc.ticketsReplied += log.tickets_replied || 0;
      acc.dsatCount += log.dsat_count || 0;
      acc.csatCount += log.csat_count || 0;
      return acc;
    }, {
      onlineTimeMinutes: 0,
      breakTimeMinutes: 0,
      activeTimeMinutes: 0,
      ticketsAssigned: 0,
      ticketsResolved: 0,
      ticketsClosed: 0,
      ticketsReopened: 0,
      ticketsUpdated: 0,
      ticketsReplied: 0,
      dsatCount: 0,
      csatCount: 0,
    });

    const ticketStats = ticketStatsResult[0] || {};
    const ratings = ratingsResult[0] || {};

    // All agents' activity for the period (same permission: anyone with ticket access can see)
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];
    const allAgentsActivityResult = await sqlClient`
      SELECT 
        ap.user_id,
        su.full_name,
        su.email,
        COALESCE(SUM(aal.online_time_minutes), 0)::int as online_time_minutes,
        COALESCE(SUM(aal.break_time_minutes), 0)::int as break_time_minutes,
        COALESCE(SUM(aal.tickets_resolved), 0)::int as tickets_resolved,
        COALESCE(SUM(aal.tickets_closed), 0)::int as tickets_closed,
        COALESCE(SUM(aal.tickets_assigned), 0)::int as tickets_assigned,
        COALESCE(SUM(aal.tickets_updated), 0)::int as tickets_updated,
        COALESCE(SUM(aal.tickets_reopened), 0)::int as tickets_reopened
      FROM agent_profiles ap
      JOIN system_users su ON su.id = ap.user_id
      LEFT JOIN agent_activity_logs aal ON aal.agent_user_id = ap.user_id
        AND aal.activity_date >= ${startDateStr}
        AND aal.activity_date <= ${endDateStr}
      GROUP BY ap.user_id, su.full_name, su.email
      ORDER BY online_time_minutes DESC, tickets_resolved DESC
    `;

    const allAgents = allAgentsActivityResult.map((row: Record<string, unknown>) => ({
      userId: row.user_id,
      name: row.full_name || row.email || `User ${row.user_id}`,
      email: row.email || "",
      onlineTimeMinutes: Number(row.online_time_minutes) || 0,
      breakTimeMinutes: Number(row.break_time_minutes) || 0,
      ticketsResolved: Number(row.tickets_resolved) || 0,
      ticketsClosed: Number(row.tickets_closed) || 0,
      ticketsAssigned: Number(row.tickets_assigned) || 0,
      ticketsUpdated: Number(row.tickets_updated) || 0,
      ticketsReopened: Number(row.tickets_reopened) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: {
          onlineTimeMinutes: aggregated.onlineTimeMinutes,
          breakTimeMinutes: aggregated.breakTimeMinutes,
          activeTimeMinutes: aggregated.activeTimeMinutes,
          ticketsAssigned: Number(ticketStats.total_assigned) || 0,
          ticketsResolved: Number(ticketStats.resolved) || 0,
          ticketsClosed: Number(ticketStats.closed) || 0,
          ticketsReopened: Number(ticketStats.reopened) || 0,
          ticketsUpdated: Number(ticketStats.updated) || 0,
          csatCount: Number(ratings.csat_count) || 0,
          dsatCount: Number(ratings.dsat_count) || 0,
          avgRating: ratings.avg_rating ? Number(ratings.avg_rating) : null,
        },
        profile: profileResult[0] || null,
        dailyBreakdown: activityLogsResult,
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
