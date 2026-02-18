/**
 * DELETE /api/tickets/[id]/messages/[messageId]
 * Delete a message (soft delete by marking as deleted)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
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

    const { id, messageId } = await params;
    const ticketId = parseInt(id, 10);
    const msgId = parseInt(messageId, 10);
    if (isNaN(ticketId) || isNaN(msgId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket or message ID" }, { status: 400 });
    }

    const sqlClient = getSql();

    // Check if message exists and belongs to current user (or user is super admin)
    const messageCheck = await sqlClient`
      SELECT id, sender_email, sender_id, created_at
      FROM public.unified_ticket_messages
      WHERE id = ${msgId} AND ticket_id = ${ticketId}
      LIMIT 1
    `;

    if (!messageCheck || messageCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 });
    }

    const msg = messageCheck[0] as { sender_email?: string | null; sender_id?: number | null; created_at: string };
    const isOwnMessage = msg.sender_email === user.email || msg.sender_id === systemUser.id;

    // Only allow deletion of own messages (unless super admin)
    if (!userIsSuperAdmin && !isOwnMessage) {
      return NextResponse.json({ success: false, error: "You can only delete your own messages" }, { status: 403 });
    }

    // Check if message is within 3 minutes
    const createdAt = new Date(msg.created_at).getTime();
    const now = Date.now();
    const diffMinutes = (now - createdAt) / (1000 * 60);
    if (!userIsSuperAdmin && diffMinutes > 3) {
      return NextResponse.json({ success: false, error: "Message can only be deleted within 3 minutes" }, { status: 400 });
    }

    // Soft delete: mark as deleted
    try {
      await sqlClient`
        UPDATE public.unified_ticket_messages
        SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${msgId} AND ticket_id = ${ticketId}
      `;
    } catch (updateErr) {
      // If is_deleted column doesn't exist, try hard delete
      if (String(updateErr).includes("is_deleted") || String(updateErr).includes("deleted_at")) {
        await sqlClient`
          DELETE FROM public.unified_ticket_messages
          WHERE id = ${msgId} AND ticket_id = ${ticketId}
        `;
      } else {
        throw updateErr;
      }
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error("[DELETE /api/tickets/[id]/messages/[messageId]] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete message",
      },
      { status: 500 }
    );
  }
}
