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
import { sendEmail, type OutboundEmailAttachment } from "@/lib/email/send";
import { loadTicketAttachmentBuffer } from "@/lib/tickets/ticket-attachment-buffer";

export const runtime = "nodejs";

function parseRecipientList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function mapAttachmentsForApiResponse(raw: unknown[]): Array<{
  storageKey: string;
  name: string;
  mimeType: string;
  url?: string;
}> {
  return raw
    .filter((a): a is { storageKey: string; name?: string; mimeType?: string; url?: string } => {
      return Boolean(a && typeof a === "object" && "storageKey" in (a as object));
    })
    .map((a) => ({
      storageKey: String(a.storageKey),
      name: typeof a.name === "string" ? a.name : "file",
      mimeType: typeof a.mimeType === "string" ? a.mimeType : "application/octet-stream",
      ...(typeof a.url === "string" && a.url.trim() !== "" ? { url: a.url.trim() } : {}),
    }));
}

function rowTimestamp(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
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

    const noteVisibility =
      typeof body.noteVisibility === "string"
        ? body.noteVisibility.trim().toLowerCase()
        : "";
    const isPrivateNote = noteVisibility === "private";
    const isPublicNote = noteVisibility === "public";
    const isInternalNote = Boolean(body.isInternalNote) || isPrivateNote;
    const requestedType =
      body.messageType && typeof body.messageType === "string"
        ? body.messageType.trim().toUpperCase()
        : "TEXT";
    const messageType = isPrivateNote
      ? "INTERNAL_NOTE"
      : isPublicNote
        ? "PUBLIC_NOTE"
        : requestedType || "TEXT";
    const senderName = systemUser.fullName ?? systemUser.email ?? "Agent";
    const senderEmail = systemUser.email ?? null;

    /** Exact outbound lists from the composer — no server-side To/Cc/Bcc injection so cleared fields stay empty. */
    const toRecipientsParsed = parseRecipientList(body.toRecipients);
    const ccRecipientsParsed = parseRecipientList(body.ccRecipients);
    const bccRecipientsParsed = parseRecipientList(body.bccRecipients);

    const attachmentsForDb = rawAttachments
      .filter((a: unknown) => a && typeof a === "object" && "storageKey" in (a as object))
      .map((a: { storageKey: string; name?: string; mimeType?: string; url?: string }) => {
        const row: Record<string, string> = {
          storageKey: String(a.storageKey),
          name: typeof a.name === "string" ? a.name : "file",
          mimeType: typeof a.mimeType === "string" ? a.mimeType : "application/octet-stream",
        };
        if (typeof a.url === "string" && a.url.trim() !== "") row.url = a.url.trim();
        return JSON.stringify(row);
      });

    const sqlClient = getSql();

    const ticketCheck = await sqlClient`
      SELECT id, first_response_at, subject, ticket_id, raised_by_email
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const isFirstResponse = (ticketCheck[0] as { first_response_at?: string | null })?.first_response_at == null;

    /** Persist actual outbound routing for agent TEXT (reply/forward); null for notes / non-email types. */
    let emailRecipientTo: string | null = null;
    let emailRecipientCc: string | null = null;
    let emailRecipientBcc: string | null = null;
    if (!isInternalNote && messageType === "TEXT") {
      const joinCsv = (arr: string[]) => (arr.length > 0 ? arr.join(", ") : null);
      emailRecipientTo = joinCsv(toRecipientsParsed);
      emailRecipientCc = joinCsv(ccRecipientsParsed);
      emailRecipientBcc = joinCsv(bccRecipientsParsed);
    }

    let messageId: number | null = null;
    let createdAt = new Date().toISOString();
    let updatedAt = createdAt;
    try {
      if (isInternalNote) {
        const inserted = await sqlClient`
          INSERT INTO public.unified_ticket_messages
            (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email, is_internal_note, internal_note_for_agent_id, attachments,
             email_recipient_to, email_recipient_cc, email_recipient_bcc)
          VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${senderEmail}, true, ${systemUser.id}, ${attachmentsForDb},
                  ${null}, ${null}, ${null})
          RETURNING id, created_at, updated_at
        `;
        const row = inserted?.[0] as { id: number; created_at?: unknown; updated_at?: unknown } | undefined;
        messageId = row?.id ?? null;
        if (row) {
          createdAt = rowTimestamp(row.created_at);
          updatedAt = rowTimestamp(row.updated_at ?? row.created_at);
        }
      } else {
        const inserted = await sqlClient`
          INSERT INTO public.unified_ticket_messages
            (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email, is_internal_note, attachments,
             email_recipient_to, email_recipient_cc, email_recipient_bcc)
          VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${senderEmail}, false, ${attachmentsForDb},
                  ${emailRecipientTo}, ${emailRecipientCc}, ${emailRecipientBcc})
          RETURNING id, created_at, updated_at
        `;
        const row = inserted?.[0] as { id: number; created_at?: unknown; updated_at?: unknown } | undefined;
        messageId = row?.id ?? null;
        if (row) {
          createdAt = rowTimestamp(row.created_at);
          updatedAt = rowTimestamp(row.updated_at ?? row.created_at);
        }
      }
    } catch (insErr) {
      if (
        String(insErr).includes("sender_email") ||
        String(insErr).includes("attachments") ||
        String(insErr).includes("email_recipient")
      ) {
        try {
          if (isInternalNote) {
            const inserted = await sqlClient`
              INSERT INTO public.unified_ticket_messages
                (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, internal_note_for_agent_id, attachments)
              VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, true, ${systemUser.id}, ${attachmentsForDb})
              RETURNING id, created_at, updated_at
            `;
            const row = inserted?.[0] as { id: number; created_at?: unknown; updated_at?: unknown } | undefined;
            messageId = row?.id ?? null;
            if (row) {
              createdAt = rowTimestamp(row.created_at);
              updatedAt = rowTimestamp(row.updated_at ?? row.created_at);
            }
          } else {
            const inserted = await sqlClient`
              INSERT INTO public.unified_ticket_messages
                (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, attachments)
              VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, false, ${attachmentsForDb})
              RETURNING id, created_at, updated_at
            `;
            const row = inserted?.[0] as { id: number; created_at?: unknown; updated_at?: unknown } | undefined;
            messageId = row?.id ?? null;
            if (row) {
              createdAt = rowTimestamp(row.created_at);
              updatedAt = rowTimestamp(row.updated_at ?? row.created_at);
            }
          }
        } catch {
          const inserted = await sqlClient`
            INSERT INTO public.unified_ticket_messages
              (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, internal_note_for_agent_id)
            VALUES (${ticketId}, ${messageText}, ${messageType}, 'AGENT', ${systemUser.id}, ${senderName}, ${isInternalNote}, ${isInternalNote ? systemUser.id : null})
            RETURNING id, created_at, updated_at
          `;
          const row = inserted?.[0] as { id: number; created_at?: unknown; updated_at?: unknown } | undefined;
          messageId = row?.id ?? null;
          if (row) {
            createdAt = rowTimestamp(row.created_at);
            updatedAt = rowTimestamp(row.updated_at ?? row.created_at);
          }
        }
      } else {
        throw insErr;
      }
    }

    if (messageId == null) {
      return NextResponse.json({ success: false, error: "Failed to save message" }, { status: 500 });
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
      activity_type: isInternalNote ? "internal_note" : isPublicNote ? "public_note" : "response",
      activity_category: (isInternalNote || isPublicNote) ? "note" : "response",
      activity_description: isInternalNote ? "Private note added" : isPublicNote ? "Public note added" : (isFirstResponse ? "First response sent" : "Response sent"),
      actor_user_id: systemUser.id,
      actor_name: senderName,
      actor_email: systemUser.email ?? null,
      actor_type: "AGENT",
      response_message_id: messageId ?? undefined,
      response_type: isInternalNote ? "internal_note" : isPublicNote ? "public_note" : "public",
      is_first_response: isInternalNote ? undefined : isFirstResponse,
    });

    let emailDispatch: { ok: true } | { ok: false; code: string } | undefined;
    const shouldEmailCustomer = !isInternalNote && messageType === "TEXT";
    if (shouldEmailCustomer) {
      const ticketRow = ticketCheck[0] as {
        subject?: unknown;
        ticket_id?: unknown;
      };

      if (
        toRecipientsParsed.length === 0 &&
        ccRecipientsParsed.length === 0 &&
        bccRecipientsParsed.length === 0
      ) {
        console.warn("[POST /api/tickets/[id]/messages] No To/Cc/Bcc; skipping SMTP");
        emailDispatch = { ok: false, code: "NO_RECIPIENT" };
      } else {
        const ticketRef =
          ticketRow.ticket_id != null && String(ticketRow.ticket_id).trim() !== ""
            ? String(ticketRow.ticket_id).trim()
            : String(ticketId);
        const subjRaw =
          typeof ticketRow.subject === "string"
            ? ticketRow.subject.trim()
            : ticketRow.subject != null
              ? String(ticketRow.subject).trim()
              : "";
        const subjBase = subjRaw || "Ticket update";
        const subject = `Re: [#${ticketRef}] ${subjBase}`.slice(0, 240);

        const plain =
          messageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(see ticket for full message)";
        const hasHtml = /<[a-z][\s\S]*>/i.test(messageText);

        const outboundAttachments: OutboundEmailAttachment[] = [];
        for (const raw of rawAttachments) {
          if (!raw || typeof raw !== "object" || !("storageKey" in (raw as object))) continue;
          const a = raw as { storageKey?: unknown; name?: unknown; mimeType?: unknown };
          const key = typeof a.storageKey === "string" ? a.storageKey.trim() : "";
          if (!key) continue;
          const name =
            typeof a.name === "string" && a.name.trim() ? a.name.trim() : key.split("/").pop() || "attachment";
          const mime =
            typeof a.mimeType === "string" && a.mimeType.trim()
              ? a.mimeType.trim()
              : "application/octet-stream";
          const loaded = await loadTicketAttachmentBuffer(key, mime);
          if (loaded) {
            outboundAttachments.push({
              filename: name,
              content: loaded.buffer,
              contentType: loaded.contentType,
            });
          } else {
            console.warn("[POST /api/tickets/[id]/messages] Attachment not loaded for outbound email:", key);
          }
        }

        const outcome = await sendEmail({
          to: toRecipientsParsed.length === 1 ? toRecipientsParsed[0] : toRecipientsParsed,
          cc: ccRecipientsParsed.length ? ccRecipientsParsed : undefined,
          bcc: bccRecipientsParsed.length ? bccRecipientsParsed : undefined,
          subject,
          text: plain,
          ...(hasHtml ? { html: messageText } : {}),
          ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
        });

        emailDispatch = outcome.ok ? { ok: true } : { ok: false, code: outcome.code };
        if (!outcome.ok) {
          console.error("[POST /api/tickets/[id]/messages] Outbound email failed:", outcome);
        }
      }

      if (messageId != null) {
        const outboundStatus = emailDispatch?.ok === true ? "sent" : "failed";
        try {
          await sqlClient`
            UPDATE public.unified_ticket_messages
            SET outbound_email_status = ${outboundStatus}
            WHERE id = ${messageId}
          `;
        } catch (statusErr) {
          console.warn("[POST /api/tickets/[id]/messages] outbound_email_status column update skipped:", statusErr);
        }
      }
    }

    const messagePayload = {
      id: messageId,
      ticket_id: ticketId,
      sender_type: "AGENT",
      sender_id: systemUser.id,
      sender_name: senderName,
      sender_email: senderEmail,
      message_type: messageType,
      is_internal_note: isInternalNote,
      message: messageText,
      attachments: mapAttachmentsForApiResponse(rawAttachments),
      created_at: createdAt,
      updated_at: updatedAt,
      email_recipient_to: emailRecipientTo,
      email_recipient_cc: emailRecipientCc,
      email_recipient_bcc: emailRecipientBcc,
    };

    return NextResponse.json({
      success: true,
      data: { sent: true, isFirstResponse, message: messagePayload, emailDispatch },
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
