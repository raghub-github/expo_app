/**
 * POST /api/tickets/[id]/messages
 * Send a reply (or internal note) for a ticket. Inserts into unified_ticket_messages
 * and updates unified_tickets (last_response_at, first_response_at if first).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

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

    const body = await request.json();
    const messageText = typeof body.messageText === "string" ? body.messageText.trim() : "";
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (!messageText && rawAttachments.length === 0) {
      return NextResponse.json({ success: false, error: "Message text or attachments required" }, { status: 400 });
    }

    const isInternalNote = Boolean(body.isInternalNote);
    const messageType = (body.messageType && typeof body.messageType === "string") ? body.messageType : "TEXT";
    const senderName = systemUser.fullName ?? systemUser.email ?? "Agent";
    const senderEmail = systemUser.email ?? null;

    const attachmentsForDb = rawAttachments
      .filter((a: unknown) => a && typeof a === "object" && "storageKey" in (a as object))
      .map((a: { storageKey: string; name?: string; mimeType?: string }) =>
        JSON.stringify({
          storageKey: String((a as { storageKey: string }).storageKey),
          name: typeof (a as { name?: string }).name === "string" ? (a as { name: string }).name : "file",
          mimeType: typeof (a as { mimeType?: string }).mimeType === "string" ? (a as { mimeType: string }).mimeType : "application/octet-stream",
        })
      );

    const sqlClient = getSql();

    const ticketCheck = await sqlClient`
      SELECT id, first_response_at FROM public.unified_tickets WHERE id = ${ticketId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const isFirstResponse = (ticketCheck[0] as { first_response_at?: string | null })?.first_response_at == null;

    let messageId: number | null = null;
    try {
      if (isInternalNote) {
        const inserted = await sqlClient`
          INSERT INTO public.unified_ticket_messages
            (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email, is_internal_note, internal_note_for_agent_id, attachments)
          VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${senderEmail}, true, ${systemUser.id}, ${attachmentsForDb})
          RETURNING id
        `;
        messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;
      } else {
        const inserted = await sqlClient`
          INSERT INTO public.unified_ticket_messages
            (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email, is_internal_note, attachments)
          VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${senderEmail}, false, ${attachmentsForDb})
          RETURNING id
        `;
        messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;
      }
    } catch (insErr) {
      if (String(insErr).includes("sender_email") || String(insErr).includes("attachments")) {
        try {
          if (isInternalNote) {
            const inserted = await sqlClient`
              INSERT INTO public.unified_ticket_messages
                (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, internal_note_for_agent_id, attachments)
              VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, true, ${systemUser.id}, ${attachmentsForDb})
              RETURNING id
            `;
            messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;
          } else {
            const inserted = await sqlClient`
              INSERT INTO public.unified_ticket_messages
                (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, attachments)
              VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, false, ${attachmentsForDb})
              RETURNING id
            `;
            messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;
          }
        } catch {
          const inserted = await sqlClient`
            INSERT INTO public.unified_ticket_messages
              (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, internal_note_for_agent_id)
            VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${isInternalNote}, ${isInternalNote ? systemUser.id : null})
            RETURNING id
          `;
          messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;
        }
      } else {
        throw insErr;
      }
    }

    if (isFirstResponse) {
      await sqlClient`
        UPDATE public.unified_tickets
        SET last_response_at = NOW(), last_response_by_type = 'AGENT', last_response_by_id = ${systemUser.id},
            first_response_at = NOW(), updated_at = NOW()
        WHERE id = ${ticketId}
      `;
    } else {
      await sqlClient`
        UPDATE public.unified_tickets
        SET last_response_at = NOW(), last_response_by_type = 'AGENT', last_response_by_id = ${systemUser.id},
            updated_at = NOW()
        WHERE id = ${ticketId}
      `;
    }

    await insertTicketActivityAudit(sqlClient, {      ticket_id: ticketId,
      activity_type: isInternalNote ? "internal_note" : "response",
      activity_category: isInternalNote ? "note" : "response",
      activity_description: isInternalNote ? "Internal note added" : (isFirstResponse ? "First response sent" : "Response sent"),
      actor_user_id: systemUser.id,
      actor_name: senderName,
      actor_email: systemUser.email ?? null,
      actor_type: "AGENT",
      response_message_id: messageId ?? undefined,
      response_type: isInternalNote ? "internal_note" : "public",
      is_first_response: isInternalNote ? undefined : isFirstResponse,
    });

    return NextResponse.json({
      success: true,
      data: { sent: true, isFirstResponse },
    });
  } catch (error) {
    console.error("[POST /api/tickets/[id]/messages] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send message",
      },
      { status: 500 }
    );
  }
}
