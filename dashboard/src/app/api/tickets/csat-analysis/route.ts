/**
 * GET /api/tickets/csat-analysis
 * Aggregated C&D-SAT for Overview / Responses / agent & group performance.
 * Query: startDate?, endDate? (YYYY-MM-DD — omit both for all-time), agentUserId?, groupId?
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { canPerformActionByAuth } from "@/lib/permissions/actions";

export const runtime = "nodejs";

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

    const hasTicketAccess =
      (await canPerformActionByAuth(user.id, user.email!, "TICKET", "UPDATE")) ||
      (await canPerformActionByAuth(user.id, user.email!, "TICKET", "ASSIGN")) ||
      (await canPerformActionByAuth(user.id, user.email!, "TICKET", "VIEW"));

    if (!hasTicketAccess) {
      return NextResponse.json(
        { success: false, error: "You don't have permission to view C&D-SAT analysis" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = (searchParams.get("startDate") ?? "").trim();
    const endDateParam = (searchParams.get("endDate") ?? "").trim();
    const agentUserIdParam = searchParams.get("agentUserId");
    const groupIdParam = searchParams.get("groupId");

    const hasStart = Boolean(startDateParam);
    const hasEnd = Boolean(endDateParam);
    const allTime = !hasStart && !hasEnd;

    let startTs: string | null = null;
    let endTs: string | null = null;
    if (!allTime) {
      const startDate = hasStart ? new Date(startDateParam) : new Date(0);
      startDate.setHours(0, 0, 0, 0);
      const endDate = hasEnd ? new Date(endDateParam) : new Date();
      endDate.setHours(23, 59, 59, 999);
      startTs = startDate.toISOString();
      endTs = endDate.toISOString();
    }

    const agentUserId = (() => {
      if (!agentUserIdParam) return null;
      const n = Number(agentUserIdParam);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    const groupId = (() => {
      if (!groupIdParam) return null;
      const n = Number(groupIdParam);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    const sql = getSql();

    const ratedRows = await sql`
      SELECT
        ut.id,
        ut.ticket_id,
        ut.satisfaction_rating,
        ut.satisfaction_feedback,
        ut.satisfaction_collected_at,
        ut.assigned_to_agent_id,
        ut.assigned_to_agent_name,
        ut.group_id,
        tg.group_name
      FROM public.unified_tickets ut
      LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
      WHERE ut.satisfaction_rating IS NOT NULL
        AND ut.satisfaction_collected_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            ut.satisfaction_collected_at >= ${startTs}::timestamptz
            AND ut.satisfaction_collected_at <= ${endTs}::timestamptz
          )
        )
        AND (${agentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${agentUserId})
        AND (${groupId}::int IS NULL OR ut.group_id = ${groupId})
      ORDER BY ut.satisfaction_collected_at DESC
      LIMIT 500
    `;

    const unansweredResult = await sql`
      SELECT COUNT(*)::int AS unanswered
      FROM public.unified_tickets ut
      WHERE ut.status IN ('RESOLVED'::unified_ticket_status, 'CLOSED'::unified_ticket_status)
        AND ut.satisfaction_rating IS NULL
        AND (
          ${allTime}::boolean
          OR (
            COALESCE(ut.closed_at, ut.resolved_at, ut.updated_at) >= ${startTs}::timestamptz
            AND COALESCE(ut.closed_at, ut.resolved_at, ut.updated_at) <= ${endTs}::timestamptz
          )
        )
        AND (${agentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${agentUserId})
        AND (${groupId}::int IS NULL OR ut.group_id = ${groupId})
    `;

    const agentsResult = await sql`
      SELECT
        ut.assigned_to_agent_id::bigint AS agent_id,
        COALESCE(MAX(ut.assigned_to_agent_name), MAX(su.full_name), MAX(su.email), 'Unassigned') AS agent_name,
        COUNT(*)::int AS responses,
        AVG(ut.satisfaction_rating)::numeric AS avg_rating,
        COUNT(*) FILTER (WHERE ut.satisfaction_rating >= 4)::int AS positive_count
      FROM public.unified_tickets ut
      LEFT JOIN public.system_users su ON su.id = ut.assigned_to_agent_id
      WHERE ut.satisfaction_rating IS NOT NULL
        AND ut.satisfaction_collected_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            ut.satisfaction_collected_at >= ${startTs}::timestamptz
            AND ut.satisfaction_collected_at <= ${endTs}::timestamptz
          )
        )
        AND ut.assigned_to_agent_id IS NOT NULL
        AND (${agentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${agentUserId})
        AND (${groupId}::int IS NULL OR ut.group_id = ${groupId})
      GROUP BY ut.assigned_to_agent_id
      ORDER BY responses DESC, avg_rating DESC
      LIMIT 100
    `;

    const groupsResult = await sql`
      SELECT
        ut.group_id::bigint AS group_id,
        COALESCE(MAX(tg.group_name), 'Ungrouped') AS group_name,
        COUNT(*)::int AS responses,
        AVG(ut.satisfaction_rating)::numeric AS avg_rating,
        COUNT(*) FILTER (WHERE ut.satisfaction_rating >= 4)::int AS positive_count
      FROM public.unified_tickets ut
      LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
      WHERE ut.satisfaction_rating IS NOT NULL
        AND ut.satisfaction_collected_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            ut.satisfaction_collected_at >= ${startTs}::timestamptz
            AND ut.satisfaction_collected_at <= ${endTs}::timestamptz
          )
        )
        AND ut.group_id IS NOT NULL
        AND (${agentUserId}::int IS NULL OR ut.assigned_to_agent_id = ${agentUserId})
        AND (${groupId}::int IS NULL OR ut.group_id = ${groupId})
      GROUP BY ut.group_id
      ORDER BY responses DESC, avg_rating DESC
      LIMIT 100
    `;

    const rows = (ratedRows as Array<Record<string, unknown>>) ?? [];
    const totalResponses = rows.length;
    const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const r of rows) {
      const rating = Number(r.satisfaction_rating);
      if (!Number.isFinite(rating)) continue;
      sum += rating;
      const bucket = Math.min(5, Math.max(1, Math.round(rating)));
      ratingBreakdown[bucket] = (ratingBreakdown[bucket] ?? 0) + 1;
      if (rating >= 4) positive += 1;
      else if (rating <= 2) negative += 1;
      else neutral += 1;
    }

    const unanswered = Number((unansweredResult[0] as { unanswered?: number })?.unanswered) || 0;
    const pct = (n: number) => (totalResponses > 0 ? Math.round((n / totalResponses) * 1000) / 10 : 0);

    const responses = rows.map((r) => {
      const rating = Number(r.satisfaction_rating);
      const bucket = rating >= 4 ? "csat" : rating <= 2 ? "dsat" : "neutral";
      return {
        ticketId: Number(r.id),
        ticketNumber: String(r.ticket_id ?? r.id),
        rating,
        feedback:
          typeof r.satisfaction_feedback === "string" && r.satisfaction_feedback.trim() !== ""
            ? r.satisfaction_feedback.trim()
            : null,
        bucket,
        agentId: r.assigned_to_agent_id != null ? Number(r.assigned_to_agent_id) : null,
        agentName: (r.assigned_to_agent_name as string) || null,
        groupId: r.group_id != null ? Number(r.group_id) : null,
        groupName: (r.group_name as string) || null,
        collectedAt: r.satisfaction_collected_at != null ? String(r.satisfaction_collected_at) : null,
      };
    });

    const mapPerf = (
      list: Array<Record<string, unknown>>,
      idKey: string,
      nameKey: string
    ) =>
      list.map((r) => {
        const responsesCount = Number(r.responses) || 0;
        const positiveCount = Number(r.positive_count) || 0;
        return {
          id: Number(r[idKey]),
          name: String(r[nameKey] || "—"),
          responses: responsesCount,
          avgRating: r.avg_rating != null ? Number(Number(r.avg_rating).toFixed(1)) : null,
          positivePct: responsesCount > 0 ? Math.round((positiveCount / responsesCount) * 1000) / 10 : 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        allTime,
        startDate: startTs,
        endDate: endTs,
        summary: {
          totalResponses,
          averageRating: totalResponses > 0 ? Math.round((sum / totalResponses) * 10) / 10 : null,
          answered: totalResponses,
          unanswered,
          positiveCount: positive,
          neutralCount: neutral,
          negativeCount: negative,
          positivePct: pct(positive),
          neutralPct: pct(neutral),
          negativePct: pct(negative),
          ratingBreakdown,
        },
        responses,
        agents: mapPerf(agentsResult as Array<Record<string, unknown>>, "agent_id", "agent_name"),
        groups: mapPerf(groupsResult as Array<Record<string, unknown>>, "group_id", "group_name"),
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets/csat-analysis]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
