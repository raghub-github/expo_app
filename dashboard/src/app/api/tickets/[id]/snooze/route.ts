import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

function resolveSnoozeUntil(durationOrDate: unknown): Date | null {
  if (typeof durationOrDate === "number" && Number.isFinite(durationOrDate) && durationOrDate > 0) {
    return new Date(Date.now() + durationOrDate * 60_000);
  }
  if (typeof durationOrDate === "string" && durationOrDate.trim() !== "") {
    const parsedAsNum = Number(durationOrDate);
    if (Number.isFinite(parsedAsNum) && parsedAsNum > 0) {
      return new Date(Date.now() + parsedAsNum * 60_000);
    }
    const d = new Date(durationOrDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const snoozedUntil = resolveSnoozeUntil(body.duration ?? body.datetime ?? body.until);
    if (!snoozedUntil) {
      return NextResponse.json(
        { success: false, error: "Provide a valid future duration (minutes) or datetime" },
        { status: 400 }
      );
    }
    const reason = typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : null;

    const sql = getSql();
    const existingRows = await sql`
      SELECT id, ticket_id, status, snoozed_until, snooze_reason
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    const existing = existingRows?.[0] as
      | { id: number; ticket_id: string; status: string; snoozed_until?: string | null; snooze_reason?: string | null }
      | undefined;
    if (!existing) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });

    const statusUpper = String(existing.status ?? "").toUpperCase();
    if (["RESOLVED", "CLOSED", "CANCELLED", "REJECTED"].includes(statusUpper)) {
      return NextResponse.json({ success: false, error: `Cannot snooze ${statusUpper.toLowerCase()} ticket` }, { status: 400 });
    }

    const updatedRows = await sql`
      UPDATE public.unified_tickets
      SET status = 'SNOOZED',
          snoozed_until = ${snoozedUntil.toISOString()},
          snooze_reason = ${reason},
          updated_at = NOW()
      WHERE id = ${ticketId}
      RETURNING id, ticket_id, status, snoozed_until, snooze_reason, updated_at
    `;
    const updated = updatedRows?.[0] as Record<string, unknown> | undefined;
    if (!updated) return NextResponse.json({ success: false, error: "Failed to snooze ticket" }, { status: 500 });

    await insertTicketActivityAudit(sql, {
      ticket_id: ticketId,
      activity_type: "snoozed",
      activity_category: "status_change",
      activity_description: `Ticket snoozed until ${snoozedUntil.toISOString()}${reason ? ` (${reason})` : ""}`,
      actor_user_id: systemUser.id,
      actor_name: systemUser.fullName ?? systemUser.email ?? "Agent",
      actor_email: systemUser.email ?? null,
      actor_type: "AGENT",
      old_status: existing.status ?? null,
      new_status: "SNOOZED",
    });

    return NextResponse.json({
      success: true,
      data: {
        ticket: updated,
      },
    });
  } catch (error) {
    console.error("[POST /api/tickets/[id]/snooze] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
