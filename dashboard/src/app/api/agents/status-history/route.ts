import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { getSql } from "@/lib/db/client";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";

/**
 * Detail lists for drill-down. A low LIMIT with DESC/ASC biases which rows are returned; use a high cap
 * and DESC so we keep the most recent events in range (supervisor view), with truncation if exceeded.
 */
const STATUS_HISTORY_DETAIL_ROW_CAP = 250_000;

/**
 * GET /api/agents/status-history
 * Aggregated presence / logout stats for a ticket agent (supervisor & ticket dashboard).
 * Query: agentUserId (required), period (today|week|month|custom), startDate, endDate
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const agentUserIdRaw = searchParams.get("agentUserId");
    const agentUserId = agentUserIdRaw != null ? Number(agentUserIdRaw) : NaN;
    if (!Number.isFinite(agentUserId) || agentUserId <= 0) {
      return NextResponse.json({ success: false, error: "agentUserId is required" }, { status: 400 });
    }

    const period = searchParams.get("period") || "week";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let startDate: Date;
    let endDate: Date = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (period === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "custom") {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { success: false, error: "startDate and endDate are required for custom range" },
          { status: 400 }
        );
      }
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid dates" }, { status: 400 });
      }
      if (startDate > endDate) {
        return NextResponse.json({ success: false, error: "End date must be on or after start date" }, { status: 400 });
      }
      const spanDays = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      if (spanDays < 1 || spanDays > 366) {
        return NextResponse.json({ success: false, error: "Date range must be 1–366 days" }, { status: 400 });
      }
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const startDayStr = startDate.toISOString().split("T")[0];
    const endDayStr = endDate.toISOString().split("T")[0];

    const sqlClient = getSql();

    const userRow = (await sqlClient`
      SELECT su.id, su.full_name, su.email
      FROM system_users su
      WHERE su.id = ${agentUserId}
      LIMIT 1
    `) as { id: unknown; full_name: string | null; email: string | null }[];

    if (!userRow?.length) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const u = userRow[0];

    const segmentAgg = (await sqlClient`
      SELECT
        status,
        COUNT(*)::int AS segment_count,
        COALESCE(SUM(duration_minutes), 0)::int AS total_minutes
      FROM agent_status_segments
      WHERE agent_user_id = ${agentUserId}
        AND ended_at >= ${startIso}::timestamptz
        AND started_at <= ${endIso}::timestamptz
      GROUP BY status
      ORDER BY status
    `) as { status: string; segment_count: number; total_minutes: number }[];

    const transitions = (await sqlClient`
      SELECT
        status,
        COUNT(*)::int AS cnt
      FROM agent_availability_logs
      WHERE agent_user_id = ${agentUserId}
        AND changed_at >= ${startIso}::timestamptz
        AND changed_at <= ${endIso}::timestamptz
      GROUP BY status
      ORDER BY status
    `) as { status: string; cnt: number }[];

    const logoutReasons = (await sqlClient`
      SELECT
        COALESCE(NULLIF(TRIM(reason), ''), '(no reason)') AS reason,
        COUNT(*)::int AS cnt
      FROM agent_availability_logs
      WHERE agent_user_id = ${agentUserId}
        AND status = 'offline'
        AND changed_at >= ${startIso}::timestamptz
        AND changed_at <= ${endIso}::timestamptz
      GROUP BY 1
      ORDER BY cnt DESC
    `) as { reason: string; cnt: number }[];

    const activityRollupRows = (await sqlClient`
      SELECT
        COALESCE(SUM(online_time_minutes), 0)::int AS online_minutes,
        COALESCE(SUM(break_time_minutes), 0)::int AS break_minutes,
        COALESCE(SUM(busy_time_minutes), 0)::int AS busy_minutes
      FROM agent_activity_logs
      WHERE agent_user_id = ${agentUserId}
        AND activity_date >= ${startDayStr}::date
        AND activity_date <= ${endDayStr}::date
    `) as { online_minutes: number; break_minutes: number; busy_minutes: number }[];

    const ar = activityRollupRows[0] ?? { online_minutes: 0, break_minutes: 0, busy_minutes: 0 };
    const onlineM = Number(ar.online_minutes) || 0;
    const busyM = Number(ar.busy_minutes) || 0;
    const breakM = Number(ar.break_minutes) || 0;

    const segmentIntervalCountRow = (await sqlClient`
      SELECT COUNT(*)::int AS c
      FROM agent_status_segments
      WHERE agent_user_id = ${agentUserId}
        AND ended_at >= ${startIso}::timestamptz
        AND started_at <= ${endIso}::timestamptz
    `) as { c: number }[];

    const availabilityEventCountRow = (await sqlClient`
      SELECT COUNT(*)::int AS c
      FROM agent_availability_logs
      WHERE agent_user_id = ${agentUserId}
        AND changed_at >= ${startIso}::timestamptz
        AND changed_at <= ${endIso}::timestamptz
    `) as { c: number }[];

    const totalSegmentIntervals = Number(segmentIntervalCountRow[0]?.c) || 0;
    const totalAvailabilityEvents = Number(availabilityEventCountRow[0]?.c) || 0;

    const segmentIntervalsResult = (await sqlClient`
      SELECT
        id,
        status,
        started_at,
        ended_at,
        duration_minutes,
        reason
      FROM agent_status_segments
      WHERE agent_user_id = ${agentUserId}
        AND ended_at >= ${startIso}::timestamptz
        AND started_at <= ${endIso}::timestamptz
      ORDER BY started_at DESC
      LIMIT ${STATUS_HISTORY_DETAIL_ROW_CAP}
    `) as {
      id: unknown;
      status: string;
      started_at: string;
      ended_at: string;
      duration_minutes: number;
      reason: string | null;
    }[];

    const availabilityEventsResult = (await sqlClient`
      SELECT
        changed_at,
        status,
        previous_status,
        reason
      FROM agent_availability_logs
      WHERE agent_user_id = ${agentUserId}
        AND changed_at >= ${startIso}::timestamptz
        AND changed_at <= ${endIso}::timestamptz
      ORDER BY changed_at DESC
      LIMIT ${STATUS_HISTORY_DETAIL_ROW_CAP}
    `) as {
      changed_at: string;
      status: string;
      previous_status: string | null;
      reason: string | null;
    }[];

    return NextResponse.json({
      success: true,
      data: {
        agent: {
          id: agentUserId,
          name: u.full_name?.trim() || u.email || `User ${agentUserId}`,
          email: u.email ?? "",
        },
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        statusSegments: segmentAgg.map((r) => ({
          status: r.status,
          segmentCount: Number(r.segment_count) || 0,
          totalMinutes: Number(r.total_minutes) || 0,
        })),
        transitionsToStatus: transitions.map((r) => ({
          status: r.status,
          count: Number(r.cnt) || 0,
        })),
        logoutReasons: logoutReasons.map((r) => ({
          reason: r.reason,
          count: Number(r.cnt) || 0,
        })),
        activityRollup: {
          availableMinutes: onlineM,
          busyMinutes: busyM,
          breakMinutes: breakM,
          workingMinutes: onlineM + busyM,
        },
        detailCaps: {
          segmentIntervalsReturned: segmentIntervalsResult.length,
          segmentIntervalsTotal: totalSegmentIntervals,
          segmentIntervalsTruncated: totalSegmentIntervals > segmentIntervalsResult.length,
          availabilityEventsReturned: availabilityEventsResult.length,
          availabilityEventsTotal: totalAvailabilityEvents,
          availabilityEventsTruncated: totalAvailabilityEvents > availabilityEventsResult.length,
          rowCap: STATUS_HISTORY_DETAIL_ROW_CAP,
        },
        segmentIntervals: segmentIntervalsResult.map((row) => ({
          id: Number(row.id),
          status: row.status,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          durationMinutes: Number(row.duration_minutes) || 0,
          reason: row.reason,
        })),
        availabilityEvents: availabilityEventsResult.map((row) => ({
          changedAt: row.changed_at,
          status: row.status,
          previousStatus: row.previous_status,
          reason: row.reason,
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/agents/status-history]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch status history" }, { status: 500 });
  }
}
