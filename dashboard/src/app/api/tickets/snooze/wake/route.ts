/**
 * POST /api/tickets/snooze/wake
 * Wake due snoozed tickets (intended for cron every minute).
 *
 * Auth (either):
 * - Signed-in dashboard user with TICKET access
 * - Authorization: Bearer <TICKETS_AUTOMATION_WORKER_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.TICKETS_AUTOMATION_WORKER_SECRET?.trim();
  if (!secret) return false;
  const h = request.headers.get("authorization")?.trim() ?? "";
  return h === `Bearer ${secret}`;
}

async function requireTicketManager() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    if (isInvalidRefreshToken(error)) {
      await supabase.auth.signOut();
      return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  const [userIsSuperAdmin, hasTicketAccess] = await Promise.all([
    isSuperAdmin(user.id, user.email!),
    hasDashboardAccessByAuth(user.id, user.email!, "TICKET"),
  ]);
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  let limit = 100;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    const n = Number(body.limit);
    if (Number.isFinite(n)) limit = Math.min(500, Math.max(1, n));
  } catch {}

  if (!authorizeCron(request)) {
    const authErr = await requireTicketManager();
    if (authErr) return authErr;
  }

  try {
    const sql = getSql() as typeof getSql extends () => infer T ? T & { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> } : never;
    const rows = await sql.unsafe(
      `
        WITH due AS (
          SELECT id
          FROM public.unified_tickets
          WHERE status = 'SNOOZED'
            AND snoozed_until IS NOT NULL
            AND snoozed_until <= NOW()
          ORDER BY snoozed_until ASC, id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE public.unified_tickets ut
        SET status = 'OPEN',
            snoozed_until = NULL,
            snooze_reason = NULL,
            updated_at = NOW()
        FROM due
        WHERE ut.id = due.id
        RETURNING ut.id, ut.ticket_id
      `,
      [limit]
    );

    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      await insertTicketActivityAudit(sql, {
        ticket_id: id,
        activity_type: "auto_unsnoozed",
        activity_category: "status_change",
        activity_description: "Ticket auto-resumed after snooze expiry",
        actor_user_id: null,
        actor_name: "System",
        actor_email: null,
        actor_type: "SYSTEM",
        old_status: "SNOOZED",
        new_status: "OPEN",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        woke: rows.length,
        ticketIds: rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n)),
      },
    });
  } catch (error) {
    console.error("[POST /api/tickets/snooze/wake] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
