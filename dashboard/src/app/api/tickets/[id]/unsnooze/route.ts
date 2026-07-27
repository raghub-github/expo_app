import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
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

    const { id } = await params;
    const ticketId = Number(id);
    if (!Number.isFinite(ticketId)) return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });

    const sql = getSql();
    const existingRows = await sql`
      SELECT id, status
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    const existing = existingRows?.[0] as { status?: string } | undefined;
    if (!existing) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });

    const oldStatus = String(existing.status ?? "").toUpperCase();
    const updatedRows = await sql`
      UPDATE public.unified_tickets
      SET status = CASE WHEN status = 'SNOOZED' THEN 'OPEN' ELSE status END,
          snoozed_until = NULL,
          snooze_reason = NULL,
          updated_at = NOW()
      WHERE id = ${ticketId}
      RETURNING id, ticket_id, status, snoozed_until, snooze_reason, updated_at
    `;
    const updated = updatedRows?.[0] as Record<string, unknown> | undefined;
    if (!updated) return NextResponse.json({ success: false, error: "Failed to unsnooze ticket" }, { status: 500 });

    await insertTicketActivityAudit(sql, {
      ticket_id: ticketId,
      activity_type: "unsnoozed",
      activity_category: "status_change",
      activity_description: "Ticket resumed from snooze",
      actor_user_id: systemUser.id,
      actor_name: systemUser.fullName ?? systemUser.email ?? "Agent",
      actor_email: systemUser.email ?? null,
      actor_type: "AGENT",
      old_status: oldStatus,
      new_status: String(updated.status ?? oldStatus),
    });

    return NextResponse.json({ success: true, data: { ticket: updated } });
  } catch (error) {
    console.error("[POST /api/tickets/[id]/unsnooze] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
