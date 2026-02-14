/**
 * GET /api/tickets/[id]/activities
 * Activity timeline for a ticket (cursor pagination)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(session.user.id, session.user.email!, "TICKET");

    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const cursor = searchParams.get("cursor"); // created_at timestamp or id

    const sqlClient = getSql();

    // Verify ticket exists
    const ticketCheck = await sqlClient`
      SELECT id FROM tickets WHERE id = ${ticketId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    // ticket_actions_audit: id, ticket_id, action_type, actor_user_id, actor_type, actor_id, old_value, new_value, metadata, created_at
    let activities: Array<{
      id: number;
      ticket_id: number;
      action_type: string;
      actor_user_id: number | null;
      actor_type: string | null;
      actor_id: number | null;
      old_value: unknown;
      new_value: unknown;
      metadata: unknown;
      created_at: string;
    }>;

    if (cursor) {
      const cursorId = parseInt(cursor, 10);
      if (!isNaN(cursorId)) {
        activities = await sqlClient`
          SELECT id, ticket_id, action_type, actor_user_id, actor_type, actor_id, old_value, new_value, metadata, created_at
          FROM ticket_actions_audit
          WHERE ticket_id = ${ticketId} AND id < ${cursorId}
          ORDER BY id DESC
          LIMIT ${limit}
        `;
      } else {
        activities = await sqlClient`
          SELECT id, ticket_id, action_type, actor_user_id, actor_type, actor_id, old_value, new_value, metadata, created_at
          FROM ticket_actions_audit
          WHERE ticket_id = ${ticketId}
          ORDER BY id DESC
          LIMIT ${limit}
        `;
      }
    } else {
      activities = await sqlClient`
        SELECT id, ticket_id, action_type, actor_user_id, actor_type, actor_id, old_value, new_value, metadata, created_at
        FROM ticket_actions_audit
        WHERE ticket_id = ${ticketId}
        ORDER BY id DESC
        LIMIT ${limit}
      `;
    }

    const nextCursor =
      activities.length === limit && activities.length > 0
        ? String(activities[activities.length - 1].id)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        activities: activities.map((a) => ({
          id: a.id,
          ticketId: a.ticket_id,
          actionType: a.action_type,
          actorType: a.actor_type,
          actorUserId: a.actor_user_id,
          actorId: a.actor_id,
          oldValue: a.old_value,
          newValue: a.new_value,
          metadata: a.metadata,
          createdAt: a.created_at,
        })),
        nextCursor,
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
