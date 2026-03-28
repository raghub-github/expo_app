/**
 * GET /api/tickets/helpdesk-dashboard
 * Aggregated ticket + failed outbound email metrics for the Tickets helpdesk dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

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

    const sqlClient = getSql();
    const sqlUnsafe = (sqlClient as { unsafe: (q: string, v?: unknown[]) => Promise<Row[]> }).unsafe;

    const spamOff = "COALESCE(ut.is_spam, false) = false";
    const groupClause = groupFilter != null ? ` AND ut.group_id = $1` : "";
    const groupClauseU = groupFilter != null ? ` AND ut_u.group_id = $1` : "";
    const params: unknown[] = groupFilter != null ? [groupFilter] : [];

    /**
     * Unassigned is a separate scalar count so it matches the ticket list filter `assignedToIds=unassigned`:
     * - Any status (list does not restrict status for that filter alone)
     * - Includes spam tickets (list does not hide spam unless user enables a spam filter)
     * - No row in system_users for assigned_to_agent_id (NULL, 0, orphaned id)
     */
    const summarySql = `
      SELECT
        COUNT(*) FILTER (
          WHERE ut.status::text NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED')
        )::int AS unresolved,
        COUNT(*) FILTER (WHERE ut.status::text = 'OPEN')::int AS open_count,
        COUNT(*) FILTER (
          WHERE ut.status::text IN ('WAITING_FOR_USER','WAITING_FOR_MERCHANT','WAITING_FOR_RIDER')
        )::int AS on_hold,
        (
          SELECT COUNT(*)::int
          FROM public.unified_tickets ut_u
          LEFT JOIN public.system_users su_u ON su_u.id = ut_u.assigned_to_agent_id
          WHERE su_u.id IS NULL
            ${groupClauseU}
        ) AS unassigned
      FROM public.unified_tickets ut
      WHERE ${spamOff}${groupClause}
    `;

    let summaryRow: Row = {};
    try {
      const [r] = await sqlUnsafe(summarySql, params);
      summaryRow = r ?? {};
    } catch (e) {
      console.error("[helpdesk-dashboard] summary query failed:", e);
      summaryRow = { unresolved: 0, open_count: 0, on_hold: 0, unassigned: 0 };
    }

    const unresolvedByGroupSql = `
      SELECT
        COALESCE(tg.group_name, 'No group') AS group_name,
        COUNT(*)::int AS cnt
      FROM public.unified_tickets ut
      LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
      WHERE ${spamOff}
        AND ut.status::text NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED')
        ${groupFilter != null ? "AND ut.group_id = $1" : ""}
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
          AND ${spamOff}
          ${groupFilter != null ? "AND ut.group_id = $1" : ""}
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
        unresolved: Number(summaryRow.unresolved ?? 0) || 0,
        open: Number(summaryRow.open_count ?? 0) || 0,
        onHold: Number(summaryRow.on_hold ?? 0) || 0,
        unassigned: Number(summaryRow.unassigned ?? 0) || 0,
        undeliveredByGroup,
        unresolvedByGroup,
        groupIdFilter: groupFilter,
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
