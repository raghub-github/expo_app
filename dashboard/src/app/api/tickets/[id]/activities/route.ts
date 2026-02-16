/**
 * GET /api/tickets/[id]/activities
 * Complete activity timeline: unified_ticket_activities + ticket-level events from unified_tickets
 * (assignment, unassignment, first response, resolved at/by, closed at, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

type ActivityItem = {
  id: string;
  ticketId: number;
  actionType: string;
  activityDescription: string | null;
  actorType: string | null;
  actorName: string | null;
  actorEmail?: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  sortKey: string;
};

export async function GET(
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

    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "80", 10) || 80));

    const sqlClient = getSql();

    const ticketCheck = await sqlClient`
      SELECT id, created_at
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const ticketCreatedAt = (ticketCheck[0] as { created_at: string }).created_at;
    const list: ActivityItem[] = [];
    const ts = (d: string | null) => (d ? new Date(d).toISOString() : "");

    // Primary source: unified_ticket_activity_audit (every action is recorded here)
    let auditRows: Array<{
      id: number;
      ticket_id: number;
      activity_type: string;
      activity_category: string;
      activity_description: string;
      actor_user_id: number | null;
      actor_name: string | null;
      actor_email: string | null;
      actor_type: string | null;
      old_value: unknown;
      new_value: unknown;
      created_at: string;
    }> = [];
    try {
      auditRows = await sqlClient`
        SELECT id, ticket_id, activity_type, activity_category, activity_description,
               actor_user_id, actor_name, actor_email, actor_type, old_value, new_value, created_at
        FROM public.unified_ticket_activity_audit
        WHERE ticket_id = ${ticketId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } catch {
      // table may not exist or actor_email column missing (migration 0098)
    }
    if (auditRows.length === 0 && limit > 0) {
      try {
        const fallback = await sqlClient`
          SELECT id, ticket_id, activity_type, activity_category, activity_description,
                 actor_user_id, actor_name, actor_type, old_value, new_value, created_at
          FROM public.unified_ticket_activity_audit
          WHERE ticket_id = ${ticketId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        auditRows = (fallback as Record<string, unknown>[]).map((r) => ({ ...r, actor_email: null })) as typeof auditRows;
      } catch {
        // table may not exist before migration 0096
      }
    }

    for (const a of auditRows) {
      const row = a as typeof auditRows[0] & { actor_email?: string | null };
      list.push({
        id: `audit-${row.id}`,
        ticketId: row.ticket_id,
        actionType: row.activity_type,
        activityDescription: row.activity_description,
        actorType: row.actor_type,
        actorName: row.actor_name,
        actorEmail: row.actor_email ?? undefined,
        oldValue: row.old_value,
        newValue: row.new_value,
        createdAt: row.created_at,
        sortKey: ts(row.created_at) + `-${row.id}`,
      });
    }

    // Ensure "Ticket created" is present (no audit row for creation)
    const hasCreation = list.some((x) => x.actionType === "ticket_created" || x.actionType === "CREATED");
    if (!hasCreation && ticketCreatedAt) {
      list.push({
        id: "ticket-created",
        ticketId,
        actionType: "CREATED",
        activityDescription: "Ticket created",
        actorType: null,
        actorName: null,
        oldValue: null,
        newValue: null,
        createdAt: ticketCreatedAt,
        sortKey: ts(ticketCreatedAt) + "-created",
      });
    }

    // Fallback: legacy unified_ticket_activities if no audit rows yet
    if (list.length === 0) {
      let dbActivities: Array<{
        id: number;
        ticket_id: number;
        activity_type: string;
        activity_description: string | null;
        actor_type: string | null;
        actor_name: string | null;
        old_value: unknown;
        new_value: unknown;
        created_at: string;
      }> = [];
      try {
        dbActivities = await sqlClient`
          SELECT id, ticket_id, activity_type, activity_description, actor_type, actor_name, old_value, new_value, created_at
          FROM public.unified_ticket_activities
          WHERE ticket_id = ${ticketId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } catch {
        // ignore
      }
      for (const a of dbActivities) {
        list.push({
          id: `activity-${a.id}`,
          ticketId: a.ticket_id,
          actionType: a.activity_type,
          activityDescription: a.activity_description,
          actorType: a.actor_type,
          actorName: a.actor_name,
          oldValue: a.old_value,
          newValue: a.new_value,
          createdAt: a.created_at,
          sortKey: ts(a.created_at) + `-${a.id}`,
        });
      }
      // Prepend ticket created when using legacy table
      list.push({
        id: "ticket-created",
        ticketId,
        actionType: "CREATED",
        activityDescription: "Ticket created",
        actorType: null,
        actorName: null,
        oldValue: null,
        newValue: null,
        createdAt: ticketCreatedAt,
        sortKey: ts(ticketCreatedAt) + "-created",
      });
    }

    list.sort((a, b) => (b.sortKey < a.sortKey ? -1 : b.sortKey > a.sortKey ? 1 : 0));
    const trimmed = list.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: {
        activities: trimmed.map((a) => ({
          id: a.id,
          ticketId: a.ticketId,
          actionType: a.actionType,
          activityDescription: a.activityDescription,
          actorType: a.actorType,
          actorName: a.actorName,
          actorEmail: a.actorEmail ?? null,
          oldValue: a.oldValue,
          newValue: a.newValue,
          createdAt: a.createdAt,
        })),
        nextCursor: list.length > limit ? String(trimmed[trimmed.length - 1]?.id ?? "") : null,
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets/[id]/activities] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
