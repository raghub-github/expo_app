/**
 * Ticket Detail API Route
 * GET /api/tickets/[id] - Get ticket detail
 * PATCH /api/tickets/[id] - Update ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * GET /api/tickets/[id]
 * Get ticket detail with messages and participants
 */
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

    const sqlClient = getSql();

    // Get ticket
    const ticketResult = await sqlClient`
      SELECT * FROM tickets WHERE id = ${ticketId}
    `;

    if (!ticketResult || ticketResult.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const ticket = ticketResult[0];

    // Get assignee
    let assignee = null;
    if (ticket.current_assignee_user_id) {
      const assigneeResult = await sqlClient`
        SELECT id, full_name, email
        FROM system_users
        WHERE id = ${ticket.current_assignee_user_id}
        LIMIT 1
      `;
      assignee = assigneeResult[0] || null;
    }

    // Get title
    let title = null;
    if (ticket.title_id) {
      const titleResult = await sqlClient`
        SELECT id, title_text, description
        FROM ticket_titles
        WHERE id = ${ticket.title_id}
        LIMIT 1
      `;
      title = titleResult[0] || null;
    }

    // Get messages
    const messagesResult = await sqlClient`
      SELECT * FROM ticket_messages
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at
    `;
    const messages = messagesResult || [];

    // Get participants
    const participantsResult = await sqlClient`
      SELECT * FROM ticket_participants
      WHERE ticket_id = ${ticketId}
    `;
    const participants = participantsResult || [];

    return NextResponse.json({
      success: true,
      data: {
        ticket: {
          ...ticket,
          assignee: assignee,
          title: title,
          messages: messages,
          participants: participants,
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/tickets/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tickets/[id]
 * Update ticket
 */
export async function PATCH(
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

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const body = await request.json();
    const sqlClient = getSql();

    // Check if ticket exists
    const existingTicketResult = await sqlClient`
      SELECT * FROM tickets WHERE id = ${ticketId} LIMIT 1
    `;

    if (!existingTicketResult || existingTicketResult.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    // Build update object
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (body.status !== undefined) {
      updateFields.push(`status = $${updateValues.length + 1}`);
      updateValues.push(body.status);
    }
    if (body.priority !== undefined) {
      updateFields.push(`priority = $${updateValues.length + 1}`);
      updateValues.push(body.priority);
    }
    if (body.currentAssigneeUserId !== undefined) {
      updateFields.push(`current_assignee_user_id = $${updateValues.length + 1}`);
      updateValues.push(body.currentAssigneeUserId || null);
    }
    if (body.groupId !== undefined) {
      // Update group via ticket_titles.group_id
      // Note: This updates the title's group, which affects all tickets with that title
      // TODO: Consider adding group_id directly to tickets table for per-ticket groups
      const ticket = existingTicketResult[0];
      if (ticket.title_id) {
        await sqlClient`
          UPDATE ticket_titles
          SET group_id = ${body.groupId || null}, updated_at = NOW()
          WHERE id = ${ticket.title_id}
        `;
      }
    }
    if (body.slaDueAt !== undefined) {
      updateFields.push(`sla_due_at = $${updateValues.length + 1}`);
      updateValues.push(body.slaDueAt || null);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    updateFields.push(`updated_at = NOW()`);

    // Update ticket using unsafe for dynamic SET clause
    const updateQuery = (sqlClient as any).unsafe(
      `UPDATE tickets SET ${updateFields.join(", ")} WHERE id = $${updateValues.length + 1} RETURNING *`,
      [...updateValues, ticketId]
    );
    const updatedTicketResult = await updateQuery;
    const updatedTicket = updatedTicketResult[0];

    return NextResponse.json({
      success: true,
      data: { ticket: updatedTicket },
    });
  } catch (error) {
    console.error("[PATCH /api/tickets/[id]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
