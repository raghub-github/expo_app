/**
 * GET /api/tickets/helpdesk-dashboard
 * Aggregated ticket + failed outbound email metrics for the Tickets GatiMitra Queue dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

function rowInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseISODate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

/** Shared WHERE on `ut` / `ut_u` (spam, group, created range). Same $1..$n in one statement. */
function buildTicketWhereParts(
  groupFilter: number | null,
  dateFrom: string | null,
  dateTo: string | null
): { whereUt: string; whereUtU: string; whereUtAll: string; params: unknown[] } {
  const params: unknown[] = [];
  let n = 1;
  const baseChunks: string[] = [];
  if (groupFilter != null) {
    baseChunks.push(`ut.group_id = $${n}`);
    params.push(groupFilter);
    n++;
  }
  if (dateFrom) {
    baseChunks.push(`ut.created_at >= $${n}::date`);
    params.push(dateFrom);
    n++;
  }
  if (dateTo) {
    baseChunks.push(`ut.created_at < ($${n}::date + interval '1 day')`);
    params.push(dateTo);
    n++;
  }
  const spamSafeClause = "COALESCE(ut.is_spam, false) = false";
  const whereUt = [spamSafeClause, ...baseChunks].join(" AND ");
  const whereUtU = [spamSafeClause, ...baseChunks]
    .map((c) => c.replace(/\but\./g, "ut_u."))
    .join(" AND ");
  const whereUtAll = baseChunks.length > 0 ? baseChunks.join(" AND ") : "TRUE";
  return { whereUt, whereUtU, whereUtAll, params };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
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
    const groupRaw = searchParams.get("groupId");
    const groupId =
      groupRaw != null && groupRaw !== "" && groupRaw !== "all"
        ? parseInt(groupRaw, 10)
        : null;
    const groupFilter =
      groupId != null && Number.isFinite(groupId) && groupId > 0 ? groupId : null;

    const dateFrom = parseISODate(searchParams.get("dateFrom"));
    const dateTo = parseISODate(searchParams.get("dateTo"));

    const { whereUt, whereUtU, whereUtAll, params } = buildTicketWhereParts(groupFilter, dateFrom, dateTo);

    const sqlClient = getSql();
    const sqlUnsafe = (sqlClient as { unsafe: (q: string, v?: unknown[]) => Promise<Row[]> }).unsafe;

    /**
     * Unassigned = no effective agent (same rules as GET /api/tickets `assignedToIds=unassigned`).
     * Scoped to non-spam + same group/date filters as other dashboard totals.
     */
    const summarySql = `
      WITH filtered AS (
        SELECT
          ut.*,
          UPPER(COALESCE(ut.status::text, '')) AS status_norm
        FROM public.unified_tickets ut
        WHERE ${whereUt}
      )
      SELECT
        COUNT(*) FILTER (
          WHERE f.status_norm NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED','SNOOZED')
        )::int AS unresolved,
        COUNT(*) FILTER (WHERE f.status_norm = 'OPEN')::int AS open_count,
        COUNT(*) FILTER (
          WHERE f.status_norm IN ('PENDING','WAITING_FOR_USER')
        )::int AS on_hold,
        (
          SELECT COUNT(*)::int
          FROM public.unified_tickets ut_all
          WHERE ${whereUtAll.replace(/\but\./g, "ut_all.")}
        ) AS total_count,
        COUNT(*) FILTER (WHERE f.status_norm = 'RESOLVED')::int AS resolved_count,
        COUNT(*) FILTER (
          WHERE f.sla_due_at IS NOT NULL
            AND f.sla_due_at < NOW()
            AND f.status_norm NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED','SNOOZED')
        )::int AS overdue,
        COUNT(*) FILTER (
          WHERE f.sla_due_at IS NOT NULL
            AND f.sla_due_at >= date_trunc('day', NOW())
            AND f.sla_due_at < date_trunc('day', NOW()) + interval '1 day'
            AND f.status_norm NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED','SNOOZED')
        )::int AS due_today,
        COUNT(*) FILTER (
          WHERE
            f.assigned_to_agent_id IS NULL
            OR f.assigned_to_agent_id = 0
            OR BTRIM(COALESCE(f.assigned_to_agent_name, '')) = ''
            OR NOT EXISTS (
              SELECT 1 FROM public.system_users su_a
              WHERE su_a.id = f.assigned_to_agent_id
                AND su_a.deleted_at IS NULL
            )
        )::int AS unassigned
      FROM filtered f
    `;

    let summaryRow: Row = {};
    try {
      const [r] = await sqlUnsafe(summarySql, params);
      summaryRow = r ?? {};
    } catch (e) {
      console.error("[helpdesk-dashboard] summary query failed:", e);
      summaryRow = {
        unresolved: 0,
        open_count: 0,
        on_hold: 0,
        unassigned: 0,
        total_count: 0,
        resolved_count: 0,
        overdue: 0,
        due_today: 0,
      };
    }

    const unresolvedByGroupSql = `
      SELECT
        COALESCE(tg.group_name, 'No group') AS group_name,
        COUNT(*)::int AS cnt
      FROM public.unified_tickets ut
      LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
      WHERE ${whereUt}
        AND UPPER(COALESCE(ut.status::text, '')) NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED','SNOOZED')
      GROUP BY tg.id, tg.group_name
      ORDER BY cnt DESC
      LIMIT 25
    `;

    let unresolvedByGroup: { groupName: string; count: number }[] = [];
    try {
      const rows = await sqlUnsafe(unresolvedByGroupSql, params);
      unresolvedByGroup = (rows || []).map((row) => ({
        groupName: String(row.group_name ?? "No group"),
        count: Number(row.cnt ?? 0) || 0,
      }));
    } catch (e) {
      console.error("[helpdesk-dashboard] unresolvedByGroup failed:", e);
    }

    let undeliveredByGroup: { groupName: string; count: number }[] = [];
    try {
      const undeliveredSql = `
        SELECT
          COALESCE(tg.group_name, 'No group') AS group_name,
          COUNT(*)::int AS cnt
        FROM public.unified_ticket_messages m
        INNER JOIN public.unified_tickets ut ON ut.id = m.ticket_id
        LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
        WHERE m.outbound_email_status = 'failed'
          AND ${whereUt}
        GROUP BY tg.id, tg.group_name
        ORDER BY cnt DESC
        LIMIT 25
      `;
      const rows = await sqlUnsafe(undeliveredSql, params);
      undeliveredByGroup = (rows || []).map((row) => ({
        groupName: String(row.group_name ?? "No group"),
        count: Number(row.cnt ?? 0) || 0,
      }));
    } catch (e) {
      console.warn("[helpdesk-dashboard] undeliveredByGroup skipped (column or table):", e);
      undeliveredByGroup = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        unresolved: rowInt(summaryRow.unresolved),
        open: rowInt(summaryRow.open_count),
        onHold: rowInt(summaryRow.on_hold),
        unassigned: rowInt(summaryRow.unassigned),
        total: rowInt(summaryRow.total_count),
        resolved: rowInt(summaryRow.resolved_count),
        overdue: rowInt(summaryRow.overdue),
        dueToday: rowInt(summaryRow.due_today),
        undeliveredByGroup,
        unresolvedByGroup,
        groupIdFilter: groupFilter,
        dateFrom,
        dateTo,
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets/helpdesk-dashboard] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load dashboard",
      },
      { status: 500 }
    );
  }
}
