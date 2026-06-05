/**
 * Ticket Detail API Route
 * GET /api/tickets/[id] - Get ticket detail from public.unified_tickets (exact DB status)
 * PATCH /api/tickets/[id] - Update ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail, getSystemUserById } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { queueTicketAssignedNotification, queueTicketReopenedNotification } from "@/lib/tickets/ticket-notification-send";
import { validateAssigneeForTicket } from "@/lib/tickets/assignee-eligibility";
import { pickRoundRobinAssigneeForGroup } from "@/lib/tickets/round-robin-auto-assign";
import { coerceSqlTextArray } from "@/lib/tickets/coerce-sql-text-array";
import { parseTicketAttachmentItem } from "@/lib/tickets/parse-ticket-attachment";

export const runtime = "nodejs";

function normalizeTicketAssigneeId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/tickets/[id]
 * Fetch from public.unified_tickets and unified_ticket_messages. Return exact status from DB.
 */
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
    const rawIdentifier = decodeURIComponent(String(id || "")).trim();
    if (!rawIdentifier) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }
    const numericTicketId = /^\d+$/.test(rawIdentifier) ? parseInt(rawIdentifier, 10) : null;

    const sqlClient = getSql();
    // If snooze is already expired, wake immediately on read.
    try {
      const sqlAudit = sqlClient as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient;
      if (numericTicketId != null) {
        const wokeRows = await sqlClient`
          UPDATE public.unified_tickets
          SET status = 'OPEN',
              snoozed_until = NULL,
              snooze_reason = NULL,
              updated_at = NOW()
          WHERE id = ${numericTicketId}
            AND status = 'SNOOZED'
            AND snoozed_until IS NOT NULL
            AND snoozed_until <= NOW()
          RETURNING id
        ` as Record<string, unknown>[];
        for (const row of wokeRows) {
          const id = Number(row.id);
          if (!Number.isFinite(id)) continue;
          await insertTicketActivityAudit(sqlAudit, {
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
      } else {
        const wokeRows = await sqlClient`
          UPDATE public.unified_tickets
          SET status = 'OPEN',
              snoozed_until = NULL,
              snooze_reason = NULL,
              updated_at = NOW()
          WHERE ticket_id = ${rawIdentifier}
            AND status = 'SNOOZED'
            AND snoozed_until IS NOT NULL
            AND snoozed_until <= NOW()
          RETURNING id
        ` as Record<string, unknown>[];
        for (const row of wokeRows) {
          const id = Number(row.id);
          if (!Number.isFinite(id)) continue;
          await insertTicketActivityAudit(sqlAudit, {
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
      }
    } catch (wakeErr) {
      console.warn("[GET /api/tickets/[id]] opportunistic snooze wake skipped:", wakeErr);
    }
    try {
      if (numericTicketId != null) {
        await sqlClient`
          WITH cfg AS (
            SELECT
              COALESCE(sla_minutes_low, 30) AS low_mins,
              COALESCE(sla_minutes_medium, 25) AS medium_mins,
              COALESCE(sla_minutes_high, 20) AS high_mins,
              COALESCE(sla_minutes_urgent, 15) AS urgent_mins,
              COALESCE(sla_minutes_critical, 10) AS critical_mins
            FROM public.ticket_queue_auto_assign_settings
            WHERE id = 1
            LIMIT 1
          )
          UPDATE public.unified_tickets ut
          SET
            sla_due_at = COALESCE(
              ut.sla_due_at,
              ut.created_at + make_interval(mins => (
                CASE upper(COALESCE(ut.priority::text, 'MEDIUM'))
                  WHEN 'CRITICAL' THEN COALESCE((SELECT critical_mins FROM cfg), 10)
                  WHEN 'URGENT' THEN COALESCE((SELECT urgent_mins FROM cfg), 15)
                  WHEN 'HIGH' THEN COALESCE((SELECT high_mins FROM cfg), 20)
                  WHEN 'LOW' THEN COALESCE((SELECT low_mins FROM cfg), 30)
                  ELSE COALESCE((SELECT medium_mins FROM cfg), 25)
                END
              ))
            ),
            tags = CASE
              WHEN ut.status::text IN ('RESOLVED', 'CLOSED')
                THEN array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
              WHEN COALESCE(
                ut.sla_due_at,
                ut.created_at + make_interval(mins => (
                  CASE upper(COALESCE(ut.priority::text, 'MEDIUM'))
                    WHEN 'CRITICAL' THEN COALESCE((SELECT critical_mins FROM cfg), 10)
                    WHEN 'URGENT' THEN COALESCE((SELECT urgent_mins FROM cfg), 15)
                    WHEN 'HIGH' THEN COALESCE((SELECT high_mins FROM cfg), 20)
                    WHEN 'LOW' THEN COALESCE((SELECT low_mins FROM cfg), 30)
                    ELSE COALESCE((SELECT medium_mins FROM cfg), 25)
                  END
                ))
              ) <= NOW()
                THEN CASE
                  WHEN COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
                    THEN COALESCE(ut.tags, ARRAY[]::text[])
                  ELSE array_append(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
                END
              ELSE array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
            END,
            updated_at = NOW()
          WHERE ut.id = ${numericTicketId}
        `;
      }
    } catch (slaSyncErr) {
      console.warn("[GET /api/tickets/[id]] SLA sync skipped:", slaSyncErr);
    }

    // Get ticket by either primary key id or external ticket_id; include group/tags/store joins.
    type TicketRow = Record<string, unknown> & {
      group_id?: number | null; group_code?: string; group_name?: string; tags?: string[] | null;
      merchant_store_id?: number | null; store_number?: string | null; store_parent_id?: number | null;
      store_email?: string | null; store_phones?: string[] | null;
      store_name?: string | null;
      store_display_name?: string | null;
      parent_merchant_id?: string | null; parent_phone?: string | null; parent_owner_name?: string | null;
      customer_full_name?: string | null; customer_mobile?: string | null;
      rider_name?: string | null; rider_mobile?: string | null;
      formatted_order_id?: string | null;
      buyer_np_name?: string | null; seller_np_name?: string | null; logistics_np_name?: string | null;
      igm_action_triggered?: string | null; igm_short_resolution?: string | null; igm_long_resolution?: string | null;
      igm_refund_amount?: string | number | null; gro_details?: string | null;
    };
    let ticketResult: TicketRow[];
    try {
      const rows = await sqlClient`
        SELECT
          ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
          ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_id, ut.raised_by_name, ut.raised_by_mobile, ut.raised_by_email,
          ut.customer_id, ut.rider_id, ut.merchant_parent_id,
          ut.subject, ut.description, ut.attachments,
          ut.priority, ut.status, ut.is_spam,
          ut.satisfaction_rating, ut.satisfaction_feedback, ut.satisfaction_collected_at,
          ut.assigned_to_agent_id, ut.assigned_to_agent_name,
          su.email AS assigned_to_agent_email,
          ut.first_response_at, ut.first_response_time_minutes,
          ut.resolved_at, ut.closed_at, ut.created_at, ut.updated_at,
          ut.snoozed_until, ut.snooze_reason,
          ut.sla_due_at,
          ut.group_id,
          tg.group_code, tg.group_name,
          ut.tags, ut.merchant_store_id,
          ut.metadata,
          ut.buyer_np_name, ut.seller_np_name, ut.logistics_np_name,
          ut.igm_action_triggered, ut.igm_short_resolution, ut.igm_long_resolution, ut.igm_refund_amount, ut.gro_details,
          oc.formatted_order_id AS formatted_order_id,
          ms.store_id AS store_number,
          ms.parent_id AS store_parent_id,
          ms.store_email AS store_email,
          ms.store_phones AS store_phones,
          ms.store_name AS store_name,
          ms.store_display_name AS store_display_name,
          mp.parent_merchant_id AS parent_merchant_id,
          mp.registered_phone AS parent_phone,
          mp.owner_name AS parent_owner_name,
          c.full_name AS customer_full_name,
          c.primary_mobile AS customer_mobile,
          r.name AS rider_name,
          r.mobile AS rider_mobile
        FROM public.unified_tickets ut
        LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
        LEFT JOIN public.system_users su ON su.id = ut.assigned_to_agent_id
        LEFT JOIN public.orders_core oc ON oc.id = ut.order_id
        LEFT JOIN public.customers c ON c.id = ut.customer_id
        LEFT JOIN public.riders r ON r.id = ut.rider_id
        LEFT JOIN public.merchant_stores ms ON ms.id = ut.merchant_store_id
        LEFT JOIN public.merchant_parents mp ON mp.id = COALESCE(ut.merchant_parent_id, ms.parent_id)
        WHERE ${numericTicketId != null ? sqlClient`ut.id = ${numericTicketId}` : sqlClient`ut.ticket_id = ${rawIdentifier}`}
      `;
      ticketResult = (rows || []) as TicketRow[];
    } catch (colErr) {
      try {
        const rows = await sqlClient`
          SELECT
            ut.id, ut.ticket_id, ut.ticket_type, ut.ticket_source, ut.service_type, ut.ticket_title, ut.ticket_category,
            ut.order_id, ut.order_type, ut.raised_by_type, ut.raised_by_id, ut.raised_by_name, ut.raised_by_mobile, ut.raised_by_email,
            ut.customer_id, ut.rider_id, ut.merchant_parent_id,
            ut.subject, ut.description, ut.attachments,
            ut.priority, ut.status, ut.is_spam,
            ut.satisfaction_rating, ut.satisfaction_feedback, ut.satisfaction_collected_at,
            ut.assigned_to_agent_id, ut.assigned_to_agent_name,
            su.email AS assigned_to_agent_email,
            ut.first_response_at, ut.first_response_time_minutes,
            ut.resolved_at, ut.closed_at, ut.created_at, ut.updated_at,
            ut.snoozed_until, ut.snooze_reason,
            ut.sla_due_at,
            ut.group_id,
            tg.group_code, tg.group_name,
            ut.tags, ut.merchant_store_id,
            ut.metadata,
            ut.buyer_np_name, ut.seller_np_name, ut.logistics_np_name,
            ut.igm_action_triggered, ut.igm_short_resolution, ut.igm_long_resolution, ut.igm_refund_amount, ut.gro_details,
            oc.formatted_order_id AS formatted_order_id,
            ms.store_id AS store_number,
            ms.parent_id AS store_parent_id,
            ms.store_email AS store_email,
            ms.store_phones AS store_phones,
            ms.store_name AS store_name,
            ms.store_display_name AS store_display_name,
            mp.parent_merchant_id AS parent_merchant_id,
            mp.registered_phone AS parent_phone,
            mp.owner_name AS parent_owner_name,
            c.full_name AS customer_full_name,
            c.primary_mobile AS customer_mobile,
            r.name AS rider_name,
            r.mobile AS rider_mobile
          FROM public.unified_tickets ut
          LEFT JOIN public.ticket_groups tg ON tg.id = ut.group_id
          LEFT JOIN public.system_users su ON su.id = ut.assigned_to_agent_id
          LEFT JOIN public.orders_core oc ON oc.id = ut.order_id
          LEFT JOIN public.customers c ON c.id = ut.customer_id
          LEFT JOIN public.riders r ON r.id = ut.rider_id
          LEFT JOIN public.merchant_stores ms ON ms.id = ut.merchant_store_id
          LEFT JOIN public.merchant_parents mp ON mp.id = COALESCE(ut.merchant_parent_id, ms.parent_id)
          WHERE ${numericTicketId != null ? sqlClient`ut.id = ${numericTicketId}` : sqlClient`ut.ticket_id = ${rawIdentifier}`}
        `;
        ticketResult = (rows || []) as TicketRow[];
      } catch {
        try {
          const fallback = await sqlClient`
            SELECT
              id, ticket_id, ticket_type, ticket_source, service_type, ticket_title, ticket_category,
              order_id, order_type, raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
              customer_id, rider_id, merchant_parent_id,
              subject, description, attachments,
              priority, status, is_spam,
              satisfaction_rating, satisfaction_feedback, satisfaction_collected_at,
              assigned_to_agent_id, assigned_to_agent_name,
              first_response_at, first_response_time_minutes,
              resolved_at, closed_at, created_at, updated_at,
              snoozed_until, snooze_reason,
              sla_due_at, metadata,
              buyer_np_name, seller_np_name, logistics_np_name,
              igm_action_triggered, igm_short_resolution, igm_long_resolution, igm_refund_amount, gro_details
            FROM public.unified_tickets
            WHERE ${numericTicketId != null ? sqlClient`id = ${numericTicketId}` : sqlClient`ticket_id = ${rawIdentifier}`}
          `;
          ticketResult = (fallback as Record<string, unknown>[]).map((r) => ({
            ...r,
            group_id: null,
            group_code: undefined,
            group_name: undefined,
            tags: Array.isArray((r as any).tags) ? (r as any).tags : null,
            merchant_store_id: (r as any).merchant_store_id ?? null,
            store_number: null,
            formatted_order_id: null,
            buyer_np_name: null,
            seller_np_name: null,
            logistics_np_name: null,
            igm_action_triggered: null,
            igm_short_resolution: null,
            igm_long_resolution: null,
            igm_refund_amount: null,
            gro_details: null,
            metadata: (r as any).metadata != null && typeof (r as any).metadata === "object" ? (r as any).metadata : {},
          })) as TicketRow[];
        } catch {
          // DB may lack sla_due_at (or other columns); try without it
          const minimal = await sqlClient`
            SELECT
              id, ticket_id, ticket_type, ticket_source, service_type, ticket_title, ticket_category,
              order_id, order_type, raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
              customer_id, rider_id, merchant_parent_id,
              subject, description, attachments,
              priority, status, is_spam,
              satisfaction_rating, satisfaction_feedback, satisfaction_collected_at,
              assigned_to_agent_id, assigned_to_agent_name,
              first_response_at, first_response_time_minutes,
              resolved_at, closed_at, created_at, updated_at,
              snoozed_until, snooze_reason
            FROM public.unified_tickets
            WHERE ${numericTicketId != null ? sqlClient`id = ${numericTicketId}` : sqlClient`ticket_id = ${rawIdentifier}`}
          `;
          ticketResult = (minimal as Record<string, unknown>[]).map((r) => ({
            ...r,
            first_response_at: null,
            first_response_time_minutes: null,
            sla_due_at: null,
            group_id: null,
            group_code: undefined,
            group_name: undefined,
            tags: Array.isArray((r as any).tags) ? (r as any).tags : null,
            merchant_store_id: (r as any).merchant_store_id ?? null,
            store_number: null,
            store_parent_id: null,
            formatted_order_id: null,
            buyer_np_name: null,
            seller_np_name: null,
            logistics_np_name: null,
            igm_action_triggered: null,
            igm_short_resolution: null,
            igm_long_resolution: null,
            igm_refund_amount: null,
            gro_details: null,
            metadata: {},
          })) as TicketRow[];
        }
      }
    }

    if (!ticketResult || ticketResult.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const row = ticketResult[0] as Record<string, unknown>;
    const resolvedTicketId = Number(row.id);
    if (!Number.isFinite(resolvedTicketId)) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    // Resolve group if not already set: match by service_type, ticket_source, ticket_category, raised_by_type
    let group = (row.group_id != null && row.group_name != null)
      ? { id: row.group_id, groupCode: row.group_code ?? "", groupName: row.group_name ?? "" }
      : null;
    if (!group) {
      try {
        const st = String(row.service_type ?? "").toLowerCase().trim();
        const ts = String(row.ticket_source ?? "").toLowerCase().trim();
        const tc = String(row.ticket_category ?? "").toLowerCase().trim();
        const sr = String(row.raised_by_type ?? "").toLowerCase().trim();
        const groupRows = await sqlClient`
          SELECT id, group_code, group_name FROM ticket_groups
          WHERE is_active = true
            AND LOWER(TRIM(COALESCE(service_type::text, ''))) = ${st}
            AND LOWER(TRIM(COALESCE(ticket_section::text, ''))) = ${ts}
            AND (${tc === ""} OR LOWER(TRIM(COALESCE(ticket_category::text, ''))) = ${tc})
            AND LOWER(TRIM(COALESCE(source_role::text, ''))) = ${sr}
          ORDER BY display_order ASC NULLS LAST
          LIMIT 1
        `;
        if (Array.isArray(groupRows) && groupRows.length > 0) {
          const g = groupRows[0] as { id: number; group_code?: string; group_name?: string };
          group = { id: g.id, groupCode: g.group_code ?? "", groupName: g.group_name ?? "" };
        }
      } catch {
        // ignore
      }
    }

    const assignee =
      row.assigned_to_agent_id != null
        ? {
            id: row.assigned_to_agent_id,
            full_name: row.assigned_to_agent_name ?? "",
            email: row.assigned_to_agent_email ?? "",
          }
        : null;

    const normalizedTicketDescription =
      typeof row.description === "string"
        ? row.description.trim()
        : row.description != null
          ? String(row.description).trim()
          : "";

    let messages: Record<string, unknown>[] = [];
    try {
      let msgResult: Record<string, unknown>[] = [];
      try {
        msgResult = await sqlClient`
          SELECT id, ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email,
                 attachments, is_internal_note, created_at, updated_at,
                 email_recipient_to, email_recipient_cc, email_recipient_bcc
          FROM public.unified_ticket_messages
          WHERE ticket_id = ${resolvedTicketId}
          ORDER BY created_at ASC
        `;
      } catch {
        msgResult = await sqlClient`
          SELECT id, ticket_id, message_text, message_type, sender_type, sender_id, sender_name,
                 attachments, is_internal_note, created_at, updated_at
          FROM public.unified_ticket_messages
          WHERE ticket_id = ${resolvedTicketId}
          ORDER BY created_at ASC
        `;
      }
      messages = (msgResult || []).map((m: Record<string, unknown>) => {
        const rawAtt = m.attachments ?? [];
        const attList = Array.isArray(rawAtt) ? rawAtt : [];
        const attachments = attList
          .map((item: unknown) => parseTicketAttachmentItem(item))
          .filter(Boolean);
        return {
          id: m.id,
          ticket_id: m.ticket_id,
          sender_type: typeof m.sender_type === "string" ? m.sender_type.toUpperCase() : String(m.sender_type ?? "").toUpperCase(),
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          sender_email: m.sender_email ?? null,
          message_type: m.message_type ?? "TEXT",
          is_internal_note: Boolean(m.is_internal_note),
          message: m.message_text ?? m.message ?? "",
          attachments,
          created_at: m.created_at,
          updated_at: m.updated_at,
          email_recipient_to: m.email_recipient_to != null && String(m.email_recipient_to).trim() !== "" ? String(m.email_recipient_to).trim() : null,
          email_recipient_cc: m.email_recipient_cc != null && String(m.email_recipient_cc).trim() !== "" ? String(m.email_recipient_cc).trim() : null,
          email_recipient_bcc: m.email_recipient_bcc != null && String(m.email_recipient_bcc).trim() !== "" ? String(m.email_recipient_bcc).trim() : null,
        };
      });

      // Historical safeguard: some merchant-created tickets had the same text in both
      // unified_tickets.description and the first merchant message. Hide that duplicate in detail view.
      if (normalizedTicketDescription.length > 0) {
        let droppedFirstDuplicate = false;
        const normalizedDescription = normalizedTicketDescription.replace(/\r\n/g, "\n");
        messages = messages.filter((m) => {
          if (droppedFirstDuplicate) return true;
          const senderType = String(m.sender_type ?? "").toUpperCase();
          const body =
            typeof m.message === "string"
              ? m.message
              : typeof m.message_text === "string"
                ? m.message_text
                : "";
          if (senderType !== "MERCHANT") return true;
          if (body.replace(/\r\n/g, "\n").trim() !== normalizedDescription) return true;
          droppedFirstDuplicate = true;
          return false;
        });
      }
    } catch {
      // unified_ticket_messages may not exist
    }

    let mergedTickets: Array<{ id: number; ticket_id: string | null; status: string | null }> = [];
    try {
      // Prefer authoritative merge mapping table so merged list is accurate.
      const mergedRows = await sqlClient`
        SELECT ut.id, ut.ticket_id, ut.status
        FROM public.unified_ticket_merges um
        JOIN public.unified_tickets ut ON ut.id = um.merged_ticket_id
        WHERE um.primary_ticket_id = ${resolvedTicketId}
        ORDER BY um.merged_at DESC, ut.id DESC
      `;
      mergedTickets = (mergedRows || []).map((m: Record<string, unknown>) => ({
        id: Number(m.id),
        ticket_id: m.ticket_id != null ? String(m.ticket_id) : null,
        status: m.status != null ? String(m.status) : null,
      }));
    } catch {
      // Fallback for environments where merge table is not present yet.
      try {
        const mergedRowsFallback = await sqlClient`
          SELECT ut.id, ut.ticket_id, ut.status
          FROM public.unified_tickets ut
          WHERE ut.parent_ticket_id = ${resolvedTicketId}
          ORDER BY ut.updated_at DESC NULLS LAST, ut.id DESC
        `;
        mergedTickets = (mergedRowsFallback || []).map((m: Record<string, unknown>) => ({
          id: Number(m.id),
          ticket_id: m.ticket_id != null ? String(m.ticket_id) : null,
          status: m.status != null ? String(m.status) : null,
        }));
      } catch {
        // ignore if column/table shape differs
      }
    }

    const rawStatus = String(row.status ?? "OPEN").toLowerCase();
    const rawPriority = String(row.priority ?? "MEDIUM").toLowerCase();

    const storeNumber = row.store_number != null && String(row.store_number).trim() !== "" ? String(row.store_number) : null;
    const storeId = row.merchant_store_id != null ? String(row.merchant_store_id) : null;
    const storeParentId = row.store_parent_id != null ? Number(row.store_parent_id) : null;
    const storeEmail = typeof row.store_email === "string" && row.store_email.trim() !== "" ? row.store_email.trim() : null;
    const storePhones = Array.isArray(row.store_phones) ? (row.store_phones as string[]).filter(Boolean) : [];
    const storePhone = storePhones.length > 0 ? storePhones[0] : null;
    const parentMerchantId = typeof row.parent_merchant_id === "string" && row.parent_merchant_id.trim() !== "" ? row.parent_merchant_id.trim() : null;
    const parentPhone = typeof row.parent_phone === "string" && row.parent_phone.trim() !== "" ? row.parent_phone.trim() : null;
    const parentOwnerName = typeof row.parent_owner_name === "string" && row.parent_owner_name.trim() !== "" ? row.parent_owner_name.trim() : null;
    const merchantStoreDisplayLabel =
      typeof row.store_display_name === "string" && row.store_display_name.trim() !== ""
        ? row.store_display_name.trim()
        : typeof row.store_name === "string" && row.store_name.trim() !== ""
          ? row.store_name.trim()
          : null;
    const raisedByType = String(row.raised_by_type ?? "").toUpperCase();
    const resolvedRaisedByName =
      raisedByType === "CUSTOMER"
        ? (typeof row.customer_full_name === "string" && row.customer_full_name.trim() !== "" ? row.customer_full_name.trim() : null)
        : raisedByType === "RIDER"
          ? (typeof row.rider_name === "string" && row.rider_name.trim() !== "" ? row.rider_name.trim() : null)
          : raisedByType === "MERCHANT"
            ? (merchantStoreDisplayLabel ??
              (typeof row.parent_owner_name === "string" && row.parent_owner_name.trim() !== ""
                ? row.parent_owner_name.trim()
                : typeof row.raised_by_name === "string" && row.raised_by_name.trim() !== ""
                  ? row.raised_by_name.trim()
                  : null))
            : null;
    const resolvedRaisedByMobile =
      raisedByType === "CUSTOMER"
        ? (typeof row.customer_mobile === "string" && row.customer_mobile.trim() !== "" ? row.customer_mobile.trim() : null)
        : raisedByType === "RIDER"
          ? (typeof row.rider_mobile === "string" && row.rider_mobile.trim() !== "" ? row.rider_mobile.trim() : null)
          : raisedByType === "MERCHANT"
            ? (storePhone && String(storePhone).trim() !== ""
                ? String(storePhone).trim()
                : typeof row.parent_phone === "string" && row.parent_phone.trim() !== ""
                  ? row.parent_phone.trim()
                  : typeof row.raised_by_mobile === "string" && row.raised_by_mobile.trim() !== ""
                    ? row.raised_by_mobile.trim()
                    : null)
            : null;

    const normalizedMetadata =
      row.metadata != null && typeof row.metadata === "object"
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};

    let tags = coerceSqlTextArray(row.tags);
    if (tags.length === 0) {
      const mh = normalizedMetadata.merchant_help;
      if (mh != null && typeof mh === "object" && !Array.isArray(mh)) {
        const rawTid = (mh as Record<string, unknown>).ticket_title_id;
        const titleId =
          typeof rawTid === "number" && Number.isFinite(rawTid) && rawTid > 0
            ? rawTid
            : typeof rawTid === "string" && /^\d+$/.test(rawTid.trim())
              ? Number(rawTid.trim())
              : NaN;
        if (Number.isFinite(titleId) && titleId > 0) {
          try {
            const tagRows = await sqlClient`
              SELECT DISTINCT TRIM(xg.tag_code) AS tag_code
              FROM public.ticket_title_tags ttm
              INNER JOIN public.ticket_tags xg ON xg.id = ttm.tag_id AND xg.is_active = true
              WHERE ttm.ticket_title_id = ${titleId}
            `;
            const fromM2m = (tagRows || [])
              .map((r: Record<string, unknown>) => String(r.tag_code ?? "").trim())
              .filter(Boolean);
            if (fromM2m.length > 0) {
              tags = [...new Set(fromM2m)];
            } else {
              const legacy = await sqlClient`
                SELECT TRIM(tg.tag_code) AS tag_code
                FROM public.ticket_titles tt
                INNER JOIN public.ticket_tags tg ON tg.id = tt.tag_id AND tg.is_active = true
                WHERE tt.id = ${titleId}
                LIMIT 1
              `;
              const lc = legacy?.[0] as { tag_code?: unknown } | undefined;
              const c = lc?.tag_code != null ? String(lc.tag_code).trim() : "";
              if (c) tags = [c];
            }
          } catch {
            // ticket_title_tags / shape may be missing in some DBs
          }
        }
      }
    }

    const mergedIntoTicketIdFromMeta =
      normalizedMetadata.merged_into_ticket_id != null && String(normalizedMetadata.merged_into_ticket_id).trim() !== ""
        ? Number(normalizedMetadata.merged_into_ticket_id)
        : null;
    const mergedIntoTicketId =
      mergedIntoTicketIdFromMeta != null && Number.isFinite(mergedIntoTicketIdFromMeta) && mergedIntoTicketIdFromMeta > 0
        ? mergedIntoTicketIdFromMeta
        : null;
    let mergedIntoTicketNumber: string | null = null;
    if (mergedIntoTicketId != null) {
      try {
        const parentRows = await sqlClient`
          SELECT ticket_id
          FROM public.unified_tickets
          WHERE id = ${mergedIntoTicketId}
          LIMIT 1
        `;
        mergedIntoTicketNumber =
          parentRows?.[0] && (parentRows[0] as { ticket_id?: unknown }).ticket_id != null
            ? String((parentRows[0] as { ticket_id: unknown }).ticket_id)
            : null;
      } catch {
        // ignore
      }
    }
    const frtMarkedByMeta =
      normalizedMetadata.frt_marked_by != null
        ? String(normalizedMetadata.frt_marked_by).trim()
        : "";
    if (frtMarkedByMeta !== "" && !frtMarkedByMeta.includes("@") && /^\d+$/.test(frtMarkedByMeta)) {
      try {
        const markUserRows = await sqlClient`
          SELECT email FROM public.system_users WHERE id = ${Number(frtMarkedByMeta)} LIMIT 1
        `;
        const markEmail =
          markUserRows?.[0] && typeof (markUserRows[0] as { email?: unknown }).email === "string"
            ? String((markUserRows[0] as { email: string }).email)
            : "";
        if (markEmail) normalizedMetadata.frt_marked_by = markEmail;
      } catch {
        // keep raw value if lookup fails
      }
    }

    const subjectValue =
      typeof row.subject === "string" ? row.subject.trim() : row.subject != null ? String(row.subject).trim() : "";
    const descriptionValue = normalizedTicketDescription;

    let automation_last_run: {
      rule_id: number;
      rule_name: string;
      rule_code: string;
      trigger_event: string;
      completed_at: string | null;
    } | null = null;
    try {
      const autoRows = await sqlClient`
        SELECT e.rule_id,
               e.trigger_event::text AS trigger_event,
               e.completed_at,
               r.rule_name,
               r.rule_code
        FROM public.ticket_automation_executions e
        LEFT JOIN public.ticket_automation_rules r ON r.id = e.rule_id
        WHERE e.ticket_id = ${resolvedTicketId}
          AND e.execution_status = 'completed'
        ORDER BY e.completed_at DESC NULLS LAST, e.id DESC
        LIMIT 1
      `;
      const ar = autoRows?.[0] as Record<string, unknown> | undefined;
      if (ar && ar.rule_id != null) {
        automation_last_run = {
          rule_id: Number(ar.rule_id),
          rule_name: ar.rule_name != null ? String(ar.rule_name) : "",
          rule_code: ar.rule_code != null ? String(ar.rule_code) : "",
          trigger_event: ar.trigger_event != null ? String(ar.trigger_event) : "",
          completed_at: ar.completed_at != null ? String(ar.completed_at) : null,
        };
      }
    } catch {
      // automation tables optional in some environments
    }

    let ticketRatingRows: Array<{
      rating_value: number;
      feedback_text: string | null;
      rated_by_type: string;
      created_at: string;
    }> = [];
    try {
      const rr = await sqlClient`
        SELECT rating_value, feedback_text, rated_by_type, created_at
        FROM public.ticket_ratings
        WHERE ticket_id = ${resolvedTicketId}
        ORDER BY created_at DESC NULLS LAST
      `;
      ticketRatingRows = (rr || []).map((r: Record<string, unknown>) => ({
        rating_value: Number(r.rating_value),
        feedback_text: r.feedback_text != null ? String(r.feedback_text) : null,
        rated_by_type: String(r.rated_by_type ?? ""),
        created_at: r.created_at != null ? String(r.created_at) : "",
      }));
    } catch {
      // Optional: enterprise ratings table may reference tickets.id only or be absent.
    }

    const ticket = {
      id: row.id,
      ticket_number: row.ticket_id,
      ticket_id: row.ticket_id,
      ticket_type: row.ticket_type,
      ticket_source: row.ticket_source,
      ticket_section: row.ticket_source,
      source_role: row.raised_by_type,
      service_type: row.service_type,
      ticket_title: row.ticket_title,
      ticket_category: row.ticket_category,
      order_id: row.order_id,
      order_formatted_id:
        typeof row.formatted_order_id === "string" && row.formatted_order_id.trim() !== ""
          ? row.formatted_order_id.trim()
          : null,
      order_service_type: row.order_type,
      raised_by_type: row.raised_by_type,
      raised_by_name:
        resolvedRaisedByName ??
        (typeof row.raised_by_name === "string" && row.raised_by_name.trim() !== "" ? row.raised_by_name.trim() : null),
      raised_by_mobile:
        resolvedRaisedByMobile ??
        (typeof row.raised_by_mobile === "string" && row.raised_by_mobile.trim() !== "" ? row.raised_by_mobile.trim() : null),
      raised_by_email: row.raised_by_email ?? null,
      subject: subjectValue,
      description: descriptionValue,
      attachments: Array.isArray(row.attachments) ? row.attachments : (row.attachments ? [row.attachments] : []),
      priority: rawPriority,
      status: rawStatus,
      is_spam: row.is_spam === true || row.is_spam === "t" || row.is_spam === "true",
      assigned_to_agent_id: row.assigned_to_agent_id,
      assignee,
      group_id: group?.id ?? row.group_id ?? null,
      group,
      title: null,
      resolved_at: row.resolved_at,
      closed_at: row.closed_at,
      snoozed_until: row.snoozed_until ?? null,
      snooze_reason:
        row.snooze_reason != null && String(row.snooze_reason).trim() !== ""
          ? String(row.snooze_reason).trim()
          : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      first_response_at: row.first_response_at ?? null,
      first_response_time_minutes: row.first_response_time_minutes ?? null,
      sla_due_at: row.sla_due_at ?? null,
      messages,
      participants: [],
      tags,
      store_id: storeId,
      store_number: storeNumber,
      store_parent_id: storeParentId,
      store_email: storeEmail,
      store_phone: storePhone,
      store_phones: storePhones,
      parent_merchant_id: parentMerchantId,
      parent_phone: parentPhone,
      parent_owner_name: parentOwnerName,
      buyer_np_name: typeof row.buyer_np_name === "string" ? row.buyer_np_name : null,
      seller_np_name: typeof row.seller_np_name === "string" ? row.seller_np_name : null,
      logistics_np_name: typeof row.logistics_np_name === "string" ? row.logistics_np_name : null,
      igm_action_triggered: typeof row.igm_action_triggered === "string" ? row.igm_action_triggered : null,
      igm_short_resolution: typeof row.igm_short_resolution === "string" ? row.igm_short_resolution : null,
      igm_long_resolution: typeof row.igm_long_resolution === "string" ? row.igm_long_resolution : null,
      igm_refund_amount:
        row.igm_refund_amount != null && String(row.igm_refund_amount).trim() !== ""
          ? String(row.igm_refund_amount)
          : null,
      gro_details: typeof row.gro_details === "string" ? row.gro_details : null,
      metadata: normalizedMetadata,
      merged_into_ticket_id: mergedIntoTicketId,
      merged_into_ticket_number: mergedIntoTicketNumber,
      merged_tickets: mergedTickets,
      satisfaction_rating: row.satisfaction_rating != null ? Number(row.satisfaction_rating) : null,
      satisfaction_feedback:
        typeof row.satisfaction_feedback === "string" && row.satisfaction_feedback.trim() !== ""
          ? row.satisfaction_feedback.trim()
          : null,
      satisfaction_collected_at: row.satisfaction_collected_at != null ? String(row.satisfaction_collected_at) : null,
      ticket_ratings: ticketRatingRows,
      automation_last_run,
    };

    return NextResponse.json({
      success: true,
      data: { ticket },
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
 * Update ticket in public.unified_tickets
 */
export async function PATCH(
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

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const body = await request.json();
    const sqlClient = getSql();

    const existingResult = await sqlClient`
      SELECT id, status, priority, assigned_to_agent_id, assigned_to_agent_name, group_id, created_at, first_response_at, first_response_time_minutes, metadata
      FROM public.unified_tickets WHERE id = ${ticketId} LIMIT 1
    `;

    if (!existingResult || existingResult.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const existingRow0 = existingResult[0] as {
      status?: unknown;
      assigned_to_agent_id?: unknown;
      group_id?: unknown;
    };
    const existingStatusUpper = String(existingRow0.status ?? "OPEN")
      .toUpperCase()
      .replace(/-/g, "_");

    if (body.autoAssignRoundRobin === true) {
      if (body.currentAssigneeUserId !== undefined) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot combine autoAssignRoundRobin with currentAssigneeUserId",
          },
          { status: 400 }
        );
      }
      const curAssign = normalizeTicketAssigneeId(existingRow0.assigned_to_agent_id);
      if (curAssign != null) {
        return NextResponse.json({ success: false, error: "Ticket already assigned" }, { status: 400 });
      }
      const gid = existingRow0.group_id != null ? Number(existingRow0.group_id) : NaN;
      if (!Number.isFinite(gid)) {
        return NextResponse.json(
          { success: false, error: "Ticket has no group for auto-assign" },
          { status: 400 }
        );
      }
      const picked = await pickRoundRobinAssigneeForGroup(sqlClient, gid);
      if (picked == null) {
        return NextResponse.json(
          { success: false, error: "No eligible agent for auto-assign" },
          { status: 400 }
        );
      }
      body.currentAssigneeUserId = picked;
    }

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let shouldClearSnoozeAfterUpdate = false;

    if (body.status !== undefined) {
      const statusValue = String(body.status).toUpperCase().replace(/-/g, "_");
      const terminalPrev = ["RESOLVED", "CLOSED"].includes(existingStatusUpper);
      if (terminalPrev && ["OPEN", "REOPENED"].includes(statusValue)) {
        updateFields.push(`reopen_count = COALESCE(reopen_count, 0) + 1`);
      }
      updateFields.push(`status = $${updateValues.length + 1}`);
      updateValues.push(statusValue);
      if (statusValue !== "SNOOZED") shouldClearSnoozeAfterUpdate = true;
      if (statusValue === "RESOLVED") {
        updateFields.push(`resolved_at = COALESCE(resolved_at, NOW())`);
        updateFields.push(`resolved_by = $${updateValues.length + 1}`);
        updateValues.push(systemUser.id);
        updateFields.push(`resolved_by_name = $${updateValues.length + 1}`);
        updateValues.push(systemUser.fullName ?? systemUser.email ?? "Agent");
      } else if (statusValue === "CLOSED") {
        updateFields.push(`closed_at = COALESCE(closed_at, NOW())`);
        updateFields.push(`resolved_at = COALESCE(resolved_at, NOW())`);
        updateFields.push(`resolved_by = COALESCE(resolved_by, $${updateValues.length + 1})`);
        updateValues.push(systemUser.id);
        updateFields.push(`resolved_by_name = COALESCE(resolved_by_name, $${updateValues.length + 1})`);
        updateValues.push(systemUser.fullName ?? systemUser.email ?? "Agent");
      } else {
        updateFields.push(`resolved_at = NULL`);
        updateFields.push(`resolved_by = NULL`);
        updateFields.push(`resolved_by_name = NULL`);
        updateFields.push(`closed_at = NULL`);
      }
    }
    if (body.priority !== undefined) {
      updateFields.push(`priority = $${updateValues.length + 1}`);
      updateValues.push(String(body.priority).toUpperCase());
    }
    if (body.currentAssigneeUserId !== undefined) {
      const rawAssignee = body.currentAssigneeUserId;
      const assigneeId =
        rawAssignee == null
          ? null
          : typeof rawAssignee === "number"
            ? rawAssignee
            : Number(rawAssignee);
      const assigneeNum = assigneeId != null && Number.isFinite(assigneeId) ? assigneeId : null;

      if (assigneeNum != null) {
        const ticketGid = existingRow0.group_id != null ? Number(existingRow0.group_id) : null;
        const ticketGroupId = ticketGid != null && Number.isFinite(ticketGid) ? ticketGid : null;
        const check = await validateAssigneeForTicket(sqlClient, assigneeNum, ticketGroupId, {
          enforceAvailability: false,
        });
        if (!check.ok) {
          return NextResponse.json(
            { success: false, error: check.message, code: check.code },
            { status: 400 }
          );
        }
      }

      updateFields.push(`assigned_to_agent_id = $${updateValues.length + 1}`);
      updateValues.push(assigneeNum);
      let assigneeName: string | null = null;
      if (assigneeNum != null) {
        const assigneeUser = await getSystemUserById(assigneeNum);
        assigneeName = assigneeUser?.fullName ?? assigneeUser?.email ?? null;
      }
      updateFields.push(`assigned_to_agent_name = $${updateValues.length + 1}`);
      updateValues.push(assigneeName);
    }
    if (body.groupId !== undefined) {
      updateFields.push(`group_id = $${updateValues.length + 1}`);
      updateValues.push(body.groupId ?? null);
    }
    if (body.slaDueAt !== undefined) {
      // Pass the ISO string straight through and let Postgres cast text →
      // timestamptz. postgres.js is configured with `prepare: false` and the
      // `unsafe(query, values)` path doesn't reliably serialize Date objects
      // in simple-query mode (it falls into a Buffer.from() codepath that
      // throws `ERR_INVALID_ARG_TYPE: Received an instance of Date`).
      let isoOrNull: string | null = null;
      if (body.slaDueAt) {
        const raw = String(body.slaDueAt);
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          isoOrNull = parsed.toISOString();
        }
      }
      updateFields.push(`sla_due_at = $${updateValues.length + 1}::timestamptz`);
      updateValues.push(isoOrNull);
    }
    if (body.tags !== undefined && Array.isArray(body.tags)) {
      updateFields.push(`tags = $${updateValues.length + 1}`);
      updateValues.push((body.tags as string[]).filter((t) => typeof t === "string" && t.trim() !== ""));
    }
    if (body.isSpam !== undefined) {
      updateFields.push(`is_spam = $${updateValues.length + 1}`);
      updateValues.push(Boolean(body.isSpam));
    }
    if (body.buyerNpName !== undefined) {
      updateFields.push(`buyer_np_name = $${updateValues.length + 1}`);
      updateValues.push(body.buyerNpName ? String(body.buyerNpName) : null);
    }
    if (body.sellerNpName !== undefined) {
      updateFields.push(`seller_np_name = $${updateValues.length + 1}`);
      updateValues.push(body.sellerNpName ? String(body.sellerNpName) : null);
    }
    if (body.logisticsNpName !== undefined) {
      updateFields.push(`logistics_np_name = $${updateValues.length + 1}`);
      updateValues.push(body.logisticsNpName ? String(body.logisticsNpName) : null);
    }
    if (body.igmActionTriggered !== undefined) {
      updateFields.push(`igm_action_triggered = $${updateValues.length + 1}`);
      updateValues.push(body.igmActionTriggered ? String(body.igmActionTriggered) : null);
    }
    if (body.igmShortResolution !== undefined) {
      updateFields.push(`igm_short_resolution = $${updateValues.length + 1}`);
      updateValues.push(body.igmShortResolution ? String(body.igmShortResolution) : null);
    }
    if (body.igmLongResolution !== undefined) {
      updateFields.push(`igm_long_resolution = $${updateValues.length + 1}`);
      updateValues.push(body.igmLongResolution ? String(body.igmLongResolution) : null);
    }
    if (body.igmRefundAmount !== undefined) {
      updateFields.push(`igm_refund_amount = $${updateValues.length + 1}`);
      const n = body.igmRefundAmount == null || String(body.igmRefundAmount).trim() === "" ? null : Number(body.igmRefundAmount);
      updateValues.push(n != null && Number.isFinite(n) ? n : null);
    }
    if (body.groDetails !== undefined) {
      updateFields.push(`gro_details = $${updateValues.length + 1}`);
      updateValues.push(body.groDetails ? String(body.groDetails) : null);
    }
    if (body.markFrt !== undefined) {
      if (body.markFrt !== true) {
        return NextResponse.json({ success: false, error: "FRT can only be marked once" }, { status: 400 });
      }
      const ex = existingResult[0] as {
        first_response_at?: string | null;
        metadata?: Record<string, unknown> | null;
      };
      const alreadyMarkedByColumn = ex.first_response_at != null;
      const alreadyMarkedByMeta = Boolean(ex?.metadata && typeof ex.metadata === "object" && (ex.metadata as Record<string, unknown>).frt_marked);
      if (alreadyMarkedByColumn || alreadyMarkedByMeta) {
        return NextResponse.json({ success: false, error: "FRT already marked and locked for this ticket" }, { status: 409 });
      }
      const existingCreatedAt = new Date(String((existingResult[0] as { created_at?: string }).created_at ?? new Date().toISOString()));
      const frtMins = Math.max(0, Math.floor((Date.now() - existingCreatedAt.getTime()) / 60000));
      updateFields.push(`first_response_at = NOW()`);
      updateFields.push(`first_response_time_minutes = $${updateValues.length + 1}`);
      updateValues.push(frtMins);
      updateFields.push(
        `metadata = jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{frt_marked}', 'true'::jsonb, true),
            '{frt_marked_at}',
            to_jsonb(NOW()::text),
            true
          ),
          '{frt_marked_by}',
          to_jsonb($${updateValues.length + 1}::text),
          true
        )`
      );
      updateValues.push(String(systemUser.email ?? ""));
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    updateFields.push(`updated_at = NOW()`);

    const sql = sqlClient as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient;
    let updatedRows: unknown[];
    try {
      updatedRows = await sql.unsafe(
        `UPDATE public.unified_tickets SET ${updateFields.join(", ")} WHERE id = $${updateValues.length + 1} RETURNING id, ticket_id, status, is_spam, priority, assigned_to_agent_id, assigned_to_agent_name, group_id, first_response_at, first_response_time_minutes, metadata, updated_at`,
        [...updateValues, ticketId]
      );
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      if (msg.includes("group_id") && body.groupId !== undefined) {
        const idx = updateFields.findIndex((f) => f.startsWith("group_id"));
        const withoutGroupFields = idx >= 0 ? updateFields.filter((_, i) => i !== idx) : updateFields;
        const withoutGroupValues = idx >= 0 ? updateValues.filter((_, i) => i !== idx) : updateValues;
        if (withoutGroupFields.length > 0) {
          updatedRows = await sql.unsafe(
            `UPDATE public.unified_tickets SET ${withoutGroupFields.join(", ")} WHERE id = $${withoutGroupValues.length + 1} RETURNING id, ticket_id, status, is_spam, priority, assigned_to_agent_id, assigned_to_agent_name, first_response_at, first_response_time_minutes, metadata, updated_at`,
            [...withoutGroupValues, ticketId]
          );
        } else {
          throw updateErr;
        }
      } else {
        throw updateErr;
      }
    }
    const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
    if (shouldClearSnoozeAfterUpdate) {
      try {
        await sqlClient`
          UPDATE public.unified_tickets
          SET snoozed_until = NULL,
              snooze_reason = NULL
          WHERE id = ${ticketId}
            AND status::text <> 'SNOOZED'
        `;
      } catch (snoozeClrErr) {
        console.warn("[PATCH /api/tickets/[id]] clear snooze columns skipped:", snoozeClrErr);
      }
    }

    // Keep SLA due/tag consistent whenever status/priority/edit happens.
    try {
      await sqlClient`
        WITH cfg AS (
          SELECT
            COALESCE(sla_minutes_low, 30) AS low_mins,
            COALESCE(sla_minutes_medium, 25) AS medium_mins,
            COALESCE(sla_minutes_high, 20) AS high_mins,
            COALESCE(sla_minutes_urgent, 15) AS urgent_mins,
            COALESCE(sla_minutes_critical, 10) AS critical_mins
          FROM public.ticket_queue_auto_assign_settings
          WHERE id = 1
          LIMIT 1
        )
        UPDATE public.unified_tickets ut
        SET
          sla_due_at = COALESCE(
            ut.sla_due_at,
            ut.created_at + make_interval(mins => (
              CASE upper(COALESCE(ut.priority::text, 'MEDIUM'))
                WHEN 'CRITICAL' THEN COALESCE((SELECT critical_mins FROM cfg), 10)
                WHEN 'URGENT' THEN COALESCE((SELECT urgent_mins FROM cfg), 15)
                WHEN 'HIGH' THEN COALESCE((SELECT high_mins FROM cfg), 20)
                WHEN 'LOW' THEN COALESCE((SELECT low_mins FROM cfg), 30)
                ELSE COALESCE((SELECT medium_mins FROM cfg), 25)
              END
            ))
          ),
          tags = CASE
            WHEN ut.status::text IN ('RESOLVED', 'CLOSED')
              THEN array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
            WHEN COALESCE(
              ut.sla_due_at,
              ut.created_at + make_interval(mins => (
                CASE upper(COALESCE(ut.priority::text, 'MEDIUM'))
                  WHEN 'CRITICAL' THEN COALESCE((SELECT critical_mins FROM cfg), 10)
                  WHEN 'URGENT' THEN COALESCE((SELECT urgent_mins FROM cfg), 15)
                  WHEN 'HIGH' THEN COALESCE((SELECT high_mins FROM cfg), 20)
                  WHEN 'LOW' THEN COALESCE((SELECT low_mins FROM cfg), 30)
                  ELSE COALESCE((SELECT medium_mins FROM cfg), 25)
                END
              ))
            ) <= NOW()
              THEN CASE
                WHEN COALESCE(ut.tags, ARRAY[]::text[]) @> ARRAY['SLA_BREACHED']::text[]
                  THEN COALESCE(ut.tags, ARRAY[]::text[])
                ELSE array_append(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
              END
            ELSE array_remove(COALESCE(ut.tags, ARRAY[]::text[]), 'SLA_BREACHED')
          END,
          updated_at = NOW()
        WHERE ut.id = ${ticketId}
      `;
    } catch (slaSyncErr) {
      console.warn("[PATCH /api/tickets/[id]] SLA sync skipped:", slaSyncErr);
    }

    if (body.autoAssignRoundRobin === true && updated) {
      const u = updated as { assigned_to_agent_id?: number | null };
      const aid = u.assigned_to_agent_id;
      if (aid != null && Number.isFinite(Number(aid))) {
        try {
          await sqlClient`
            INSERT INTO public.ticket_assignment_history (
              ticket_id, agent_user_id, assignment_type, actor_user_id
            ) VALUES (${ticketId}, ${Number(aid)}, 'round_robin', ${systemUser.id})
          `;
        } catch (histErr) {
          console.warn("[PATCH /api/tickets/[id]] ticket_assignment_history:", histErr);
        }
      }
    }
    const existing = existingResult[0] as { status?: string; priority?: string; assigned_to_agent_id?: number | null; assigned_to_agent_name?: string | null; group_id?: number | null };
    const updatedRecord = updated as {
      status?: string;
      is_spam?: boolean;
      priority?: string;
      assigned_to_agent_id?: number | null;
      assigned_to_agent_name?: string | null;
      group_id?: number | null;
    } | null;
    const sqlUnsafe = sqlClient as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient;
    const actorId = systemUser.id;
    const actorName = systemUser.fullName ?? systemUser.email ?? "Agent";
    const actorEmail = systemUser.email ?? null;

    if (updatedRecord && body.status !== undefined && String(existing?.status ?? "").toUpperCase() !== String(updatedRecord.status ?? "").toUpperCase()) {
      const base = {
        ticket_id: ticketId,
        actor_user_id: actorId,
        actor_name: actorName,
        actor_email: actorEmail,
        actor_type: "AGENT" as const,
        old_status: existing?.status ?? null,
        new_status: updatedRecord.status ?? null,
      };
      const newStatusUpper = String(updatedRecord.status ?? "").toUpperCase();
      const spamRejected =
        newStatusUpper === "REJECTED" &&
        (Boolean(body.isSpam) || updatedRecord.is_spam === true);
      const statusChangeDesc = spamRejected
        ? `Status changed from ${existing?.status ?? "—"} to ${updatedRecord.status ?? "—"} (Spamed)`
        : `Status changed from ${existing?.status ?? "—"} to ${updatedRecord.status ?? "—"}`;
      await insertTicketActivityAudit(sqlUnsafe, {
        ...base,
        activity_type: "status_change",
        activity_category: "status_change",
        activity_description: statusChangeDesc,
      });
      const newStatus = newStatusUpper;
      if (newStatus === "RESOLVED") {
        await insertTicketActivityAudit(sqlUnsafe, {
          ticket_id: ticketId,
          activity_type: "resolved",
          activity_category: "resolution",
          activity_description: "Ticket resolved",
          actor_user_id: actorId,
          actor_name: actorName,
          actor_email: actorEmail,
          actor_type: "AGENT",
          resolved_by_user_id: actorId,
          new_status: updatedRecord.status ?? null,
        });
      } else if (newStatus === "CLOSED") {
        await insertTicketActivityAudit(sqlUnsafe, {
          ticket_id: ticketId,
          activity_type: "closed",
          activity_category: "closure",
          activity_description: "Ticket closed",
          actor_user_id: actorId,
          actor_name: actorName,
          actor_email: actorEmail,
          actor_type: "AGENT",
          new_status: updatedRecord.status ?? null,
        });
      } else if (newStatus === "REOPENED") {
        await insertTicketActivityAudit(sqlUnsafe, {
          ticket_id: ticketId,
          activity_type: "reopened",
          activity_category: "reopened",
          activity_description: "Ticket reopened",
          actor_user_id: actorId,
          actor_name: actorName,
          actor_email: actorEmail,
          actor_type: "AGENT",
          old_status: existing?.status ?? null,
          new_status: updatedRecord.status ?? null,
        });
        void queueTicketReopenedNotification(sqlUnsafe, ticketId).catch((e) =>
          console.error("[PATCH /api/tickets/[id]] reopen notification email:", e)
        );
      }
    }
    if (updatedRecord && body.priority !== undefined && String(existing?.priority ?? "").toUpperCase() !== String(updatedRecord.priority ?? "").toUpperCase()) {
      await insertTicketActivityAudit(sqlUnsafe, {
        ticket_id: ticketId,
        activity_type: "priority_change",
        activity_category: "priority_change",
        activity_description: `Priority changed from ${existing?.priority ?? "—"} to ${updatedRecord.priority ?? "—"}`,
        actor_user_id: actorId,
        actor_name: actorName,
        actor_email: actorEmail,
        actor_type: "AGENT",
        old_priority: existing?.priority ?? null,
        new_priority: updatedRecord.priority ?? null,
      });
    }
    if (updatedRecord && body.currentAssigneeUserId !== undefined) {
      const oldId = normalizeTicketAssigneeId(existing?.assigned_to_agent_id);
      const newId = normalizeTicketAssigneeId(updatedRecord.assigned_to_agent_id);
      if (oldId !== newId) {
        if (newId == null) {
          await insertTicketActivityAudit(sqlUnsafe, {
            ticket_id: ticketId,
            activity_type: "unassignment",
            activity_category: "unassignment",
            activity_description: `Unassigned from ${existing?.assigned_to_agent_name ?? "agent"}`,
            actor_user_id: actorId,
            actor_name: actorName,
            actor_email: actorEmail,
            actor_type: "AGENT",
            previous_assignee_user_id: oldId ?? undefined,
            previous_assignee_name: existing?.assigned_to_agent_name ?? undefined,
            unassigned_by_user_id: actorId,
          });
        } else {
          await insertTicketActivityAudit(sqlUnsafe, {
            ticket_id: ticketId,
            activity_type: "assignment",
            activity_category: "assignment",
            activity_description: `Assigned to ${updatedRecord.assigned_to_agent_name ?? "agent"}`,
            actor_user_id: actorId,
            actor_name: actorName,
            actor_email: actorEmail,
            actor_type: "AGENT",
            assigned_to_user_id: newId,
            assigned_to_name: updatedRecord.assigned_to_agent_name ?? undefined,
            assigned_by_type: "agent",
            previous_assignee_user_id: oldId ?? undefined,
            previous_assignee_name: existing?.assigned_to_agent_name ?? undefined,
          });
          void queueTicketAssignedNotification(sqlUnsafe, ticketId, newId).catch((e) =>
            console.error("[PATCH /api/tickets/[id]] assign notification email:", e)
          );
        }
      }
    }
    if (updatedRecord && body.groupId !== undefined && (existing?.group_id ?? null) !== (updatedRecord.group_id ?? null)) {
      let oldGroupName = "—";
      let newGroupName = "—";
      try {
        if (existing?.group_id != null) {
          const oldGr = await sqlClient`SELECT group_name FROM public.ticket_groups WHERE id = ${existing.group_id} LIMIT 1`;
          if (oldGr?.[0]) oldGroupName = (oldGr[0] as { group_name: string }).group_name ?? String(existing.group_id);
        }
        if (updatedRecord.group_id != null) {
          const newGr = await sqlClient`SELECT group_name FROM public.ticket_groups WHERE id = ${updatedRecord.group_id} LIMIT 1`;
          if (newGr?.[0]) newGroupName = (newGr[0] as { group_name: string }).group_name ?? String(updatedRecord.group_id);
        }
      } catch {
        // fallback to IDs
      }
      await insertTicketActivityAudit(sqlUnsafe, {
        ticket_id: ticketId,
        activity_type: "group_change",
        activity_category: "group_change",
        activity_description: `Group changed from ${oldGroupName} to ${newGroupName}`,
        actor_user_id: actorId,
        actor_name: actorName,
        actor_email: actorEmail,
        actor_type: "AGENT",
        old_group_id: existing?.group_id ?? null,
        new_group_id: updatedRecord.group_id ?? null,
      });
    }
    if (updatedRecord && body.markFrt === true) {
      await insertTicketActivityAudit(sqlUnsafe, {
        ticket_id: ticketId,
        activity_type: "first_response_marked",
        activity_category: "response",
        activity_description: "FRT Updated",
        actor_user_id: actorId,
        actor_name: actorName,
        actor_email: actorEmail,
        actor_type: "AGENT",
      });
    }

    try {
      const { processPendingAutomationJobs } = await import("@/lib/tickets/ticket-automation/job-processor");
      const { runTicketAutomation } = await import("@/lib/tickets/ticket-automation/engine");
      await processPendingAutomationJobs(sqlClient, {
        limit: 15,
        workerId: `api-patch-ticket-${ticketId}`,
      });
      const newStatusForAutomation = String(updatedRecord?.status ?? "")
        .toUpperCase()
        .replace(/-/g, "_");
      const terminalPriorAutomationReopen = new Set([
        "RESOLVED",
        "CLOSED",
        "PROVISIONALLY_RESOLVED",
        "REJECTED",
        "CANCELLED",
      ]);
      const activeStatusAutomationReopenTargets = new Set([
        "OPEN",
        "REOPENED",
        "IN_PROGRESS",
        "PENDING",
        "WAITING_FOR_USER",
        "WAITING_FOR_MERCHANT",
        "WAITING_FOR_RIDER",
        "ESCALATED",
      ]);
      const fromTerminalForReopen = terminalPriorAutomationReopen.has(existingStatusUpper);
      const isReopenAutomation =
        !!updatedRecord &&
        body.status !== undefined &&
        fromTerminalForReopen &&
        activeStatusAutomationReopenTargets.has(newStatusForAutomation);
      const autoWorker = `api-patch-ticket-${ticketId}`;
      if (isReopenAutomation) {
        await runTicketAutomation(sqlClient, "ticket_reopened", ticketId, { workerLabel: autoWorker });
      }
      await runTicketAutomation(sqlClient, "ticket_updated", ticketId, { workerLabel: autoWorker });
    } catch (autoErr) {
      console.error("[PATCH /api/tickets/[id]] workflow automation:", autoErr);
    }

    return NextResponse.json({
      success: true,
      data: { ticket: updated },
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
