"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/**
 * After a real HTTP 404, block further network calls for this id in the SPA session.
 * Broad `invalidateQueries({ queryKey: ['tickets'] })` (prefix match) was refetching
 * detail endlessly; React Query has no built-in "terminal error" for one key.
 */
const ticketDetailConfirmedNotFound = new Set<string>();

function throwCachedNotFound(): never {
  const err = new Error("") as Error & { httpStatus?: number };
  err.httpStatus = 404;
  throw err;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  serviceType: string;
  ticketCategory: string;
  ticketSection: string;
  sourceRole: string;
  ticketSource: string;
  title: {
    id: number;
    titleText: string;
    description: string | null;
  } | null;
  subject: string;
  description: string;
  /** Name of the user/source who raised the ticket (for "Created by X"). */
  raisedByName: string | null;
  /** Mobile of the user/source who raised the ticket. */
  raisedByMobile: string | null;
  /** Email of the user who raised the ticket (for "To:" in conversation). */
  raisedByEmail: string | null;
  status: string;
  /** True when marked as spam; persists if status is changed later. */
  isSpam: boolean;
  priority: string;
  orderId: number | null;
  orderFormattedId: string | null;
  orderServiceType: string | null;
  is3plOrder: boolean;
  isHighValueOrder: boolean;
  assignee: {
    id: number;
    name: string;
    email: string;
  } | null;
  group: { id: number; groupCode: string; groupName: string } | null;
  attachments: string[] | Array<{ name?: string; url?: string }>;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  firstResponseTimeMinutes: number | null;
  messages: TicketMessage[];
  participants: TicketParticipant[];
  /** Tags from DB (e.g. for header chips). */
  tags: string[];
  /** Merchant store internal id when ticket is from a store. */
  storeId: string | null;
  /** Store number / external store_id from merchant_stores when available. */
  storeNumber: string | null;
  /** Parent store id from merchant_stores when available (merchant tickets). */
  storeParentId: number | null;
  /** Store email from merchant_stores when available. */
  storeEmail: string | null;
  /** First store phone from merchant_stores.store_phones when available. */
  storePhone: string | null;
  /** Parent merchant id from merchant_parents when available. */
  parentMerchantId: string | null;
  /** Parent registered phone from merchant_parents when available. */
  parentPhone: string | null;
  /** Parent owner name from merchant_parents when available. */
  parentOwnerName: string | null;
  /** Custom fields / private info from unified_tickets.metadata. */
  metadata: Record<string, unknown>;
  mergedIntoTicketId?: number | null;
  mergedIntoTicketNumber?: string | null;
  mergedTickets?: Array<{ id: number; ticketNumber: string; status: string | null }>;
  buyerNpName: string | null;
  sellerNpName: string | null;
  logisticsNpName: string | null;
  igmActionTriggered: string | null;
  igmShortResolution: string | null;
  igmLongResolution: string | null;
  igmRefundAmount: string | null;
  groDetails: string | null;
  /** 1–5 from unified_tickets when no separate ticket_ratings rows. */
  satisfactionRating: number | null;
  satisfactionFeedback: string | null;
  satisfactionCollectedAt: string | null;
  /** Post-resolution ratings from ticket_ratings (when present). */
  ticketRatings: Array<{
    ratingValue: number;
    feedbackText: string | null;
    ratedByType: string;
    createdAt: string;
  }>;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderType: string;
  senderId: number | null;
  /** Display name of sender (e.g. agent name). */
  senderName: string | null;
  /** Full email of sender — prefer this over senderName for agents (no primary key). */
  senderEmail: string | null;
  messageType: string;
  isInternalNote?: boolean;
  message: string;
  attachments: any[];
  createdAt: string;
  updatedAt: string;
  /** Comma-separated outbound To (agent TEXT reply/forward), when stored. */
  emailRecipientTo?: string | null;
  emailRecipientCc?: string | null;
  emailRecipientBcc?: string | null;
}

/** After POST /messages — merge into React Query cache without refetch. */
export interface TicketMessageSentPayload {
  message?: TicketMessage;
  ticketStatus?: string;
  isFirstResponse?: boolean;
}

export function ticketMessageFromPostApi(
  raw: Record<string, unknown> | null | undefined,
  fallbackTicketId: number | string
): TicketMessage | undefined {
  if (!raw || typeof raw !== "object" || raw.id == null) return undefined;
  const id =
    typeof raw.id === "bigint"
      ? Number(raw.id)
      : typeof raw.id === "string"
        ? Number(raw.id.trim())
        : Number(raw.id);
  if (!Number.isFinite(id)) return undefined;
  const trimOrNull = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  };
  const fb =
    typeof fallbackTicketId === "string" ? Number(fallbackTicketId.trim()) : Number(fallbackTicketId);
  const ticketIdNum = Number.isFinite(Number(raw.ticket_id)) ? Number(raw.ticket_id) : Number.isFinite(fb) ? fb : 0;

  const bodyRaw = raw.message ?? raw.message_text;
  const bodyStr =
    bodyRaw == null ? "" : typeof bodyRaw === "string" ? bodyRaw : String(bodyRaw);

  return {
    id,
    ticketId: ticketIdNum,
    senderType: String(raw.sender_type ?? "AGENT"),
    senderId: raw.sender_id != null ? Number(raw.sender_id) : null,
    senderName: raw.sender_name != null ? String(raw.sender_name) : null,
    senderEmail: raw.sender_email != null ? String(raw.sender_email) : null,
    messageType: String(raw.message_type ?? "TEXT"),
    isInternalNote: Boolean(raw.is_internal_note),
    message: bodyStr,
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    emailRecipientTo: trimOrNull(raw.email_recipient_to ?? raw.emailRecipientTo),
    emailRecipientCc: trimOrNull(raw.email_recipient_cc ?? raw.emailRecipientCc),
    emailRecipientBcc: trimOrNull(raw.email_recipient_bcc ?? raw.emailRecipientBcc),
  };
}

export interface TicketParticipant {
  id: number;
  ticketId: number;
  participantRole: string;
  entityType: string;
  customerId: number | null;
  riderId: number | null;
  merchantId: number | null;
  systemUserId: number | null;
  createdAt: string;
}

function normalizeTicket(raw: Record<string, unknown>): TicketDetail {
  const a = raw.assignee as Record<string, unknown> | null;
  const t = raw.title as Record<string, unknown> | null;
  const g = raw.group as { id: number; groupCode?: string; groupName?: string } | null | undefined;
  const ms = (raw.messages ?? []) as Record<string, unknown>[];
  const ps = (raw.participants ?? []) as Record<string, unknown>[];
  const rawAttachments = raw.attachments;
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments
    : rawAttachments != null
      ? [typeof rawAttachments === "string" ? rawAttachments : rawAttachments]
      : [];

  const status = (raw.status != null && raw.status !== "" ? String(raw.status) : "open").toLowerCase();
  const priority = (raw.priority != null && raw.priority !== "" ? String(raw.priority) : "medium").toLowerCase();
  const groupIdRaw = g?.id as unknown;
  const groupId =
    typeof groupIdRaw === "number"
      ? groupIdRaw
      : typeof groupIdRaw === "string" && groupIdRaw.trim() !== "" && !Number.isNaN(Number(groupIdRaw))
      ? Number(groupIdRaw)
      : null;

  return {
    id: raw.id as number,
    ticketNumber: (raw.ticket_number ?? raw.ticket_id ?? raw.id) as string,
    serviceType: (raw.service_type ?? "") as string,
    ticketCategory: (raw.ticket_category ?? "") as string,
    ticketSection: (raw.ticket_section ?? "") as string,
    sourceRole: (raw.source_role ?? raw.raised_by_type ?? "") as string,
    ticketSource: (raw.ticket_source ?? raw.ticketSource ?? raw.source_role ?? raw.raised_by_type ?? "") as string,
    title: t
      ? {
          id: t.id as number,
          titleText: (t.title_text ?? t.titleText ?? "") as string,
          description: (t.description ?? null) as string | null,
        }
      : null,
    subject: (raw.subject ?? "") as string,
    description: (raw.description ?? "") as string,
    raisedByName: (raw.raised_by_name ?? null) as string | null,
    raisedByMobile: (raw.raised_by_mobile ?? null) as string | null,
    raisedByEmail: (raw.raised_by_email ?? null) as string | null,
    status,
    isSpam: Boolean(raw.is_spam ?? raw.isSpam),
    priority,
    orderId: (raw.order_id ?? null) as number | null,
    orderFormattedId: (raw.order_formatted_id ?? null) as string | null,
    orderServiceType: (raw.order_service_type ?? raw.order_type ?? null) as string | null,
    is3plOrder: (raw.is_3pl_order ?? false) as boolean,
    isHighValueOrder: (raw.is_high_value_order ?? false) as boolean,
    assignee: a
      ? {
          id: a.id as number,
          name: (a.full_name ?? a.name ?? "") as string,
          email: (a.email ?? "") as string,
        }
      : null,
    group:
      g && groupId != null
        ? { id: groupId, groupCode: g.groupCode ?? "", groupName: g.groupName ?? "" }
        : null,
    attachments,
    slaDueAt: (raw.sla_due_at ?? null) as string | null,
    resolvedAt: (raw.resolved_at ?? null) as string | null,
    closedAt: (raw.closed_at ?? null) as string | null,
    createdAt: (raw.created_at ?? "") as string,
    updatedAt: (raw.updated_at ?? "") as string,
    firstResponseAt: (raw.first_response_at ?? null) as string | null,
    firstResponseTimeMinutes:
      raw.first_response_time_minutes != null ? Number(raw.first_response_time_minutes) : null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]).filter(Boolean) : [],
    storeId: raw.store_id != null && String(raw.store_id).trim() !== "" ? String(raw.store_id) : null,
    storeNumber: raw.store_number != null && String(raw.store_number).trim() !== "" ? String(raw.store_number) : null,
    storeParentId: raw.store_parent_id != null ? Number(raw.store_parent_id) : null,
    storeEmail: typeof raw.store_email === "string" && raw.store_email.trim() !== "" ? raw.store_email.trim() : null,
    storePhone: typeof raw.store_phone === "string" && raw.store_phone.trim() !== "" ? raw.store_phone.trim() : null,
    parentMerchantId: typeof raw.parent_merchant_id === "string" && raw.parent_merchant_id.trim() !== "" ? raw.parent_merchant_id.trim() : null,
    parentPhone: typeof raw.parent_phone === "string" && raw.parent_phone.trim() !== "" ? raw.parent_phone.trim() : null,
    parentOwnerName: typeof raw.parent_owner_name === "string" && raw.parent_owner_name.trim() !== "" ? raw.parent_owner_name.trim() : null,
    metadata: raw.metadata != null && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? (raw.metadata as Record<string, unknown>) : {},
    mergedIntoTicketId: raw.merged_into_ticket_id != null ? Number(raw.merged_into_ticket_id) : null,
    mergedIntoTicketNumber: raw.merged_into_ticket_number != null ? String(raw.merged_into_ticket_number) : null,
    mergedTickets: Array.isArray(raw.merged_tickets)
      ? (raw.merged_tickets as Record<string, unknown>[])
          .map((m) => ({
            id: Number(m.id),
            ticketNumber: String(m.ticket_id ?? ""),
            status: m.status != null ? String(m.status) : null,
          }))
          .filter((m) => Number.isFinite(m.id) && m.ticketNumber)
      : [],
    buyerNpName: (raw.buyer_np_name ?? null) as string | null,
    sellerNpName: (raw.seller_np_name ?? null) as string | null,
    logisticsNpName: (raw.logistics_np_name ?? null) as string | null,
    igmActionTriggered: (raw.igm_action_triggered ?? null) as string | null,
    igmShortResolution: (raw.igm_short_resolution ?? null) as string | null,
    igmLongResolution: (raw.igm_long_resolution ?? null) as string | null,
    igmRefundAmount:
      raw.igm_refund_amount != null && String(raw.igm_refund_amount).trim() !== ""
        ? String(raw.igm_refund_amount)
        : null,
    groDetails: (raw.gro_details ?? null) as string | null,
    satisfactionRating:
      raw.satisfaction_rating != null && !Number.isNaN(Number(raw.satisfaction_rating))
        ? Number(raw.satisfaction_rating)
        : null,
    satisfactionFeedback:
      typeof raw.satisfaction_feedback === "string" && raw.satisfaction_feedback.trim() !== ""
        ? raw.satisfaction_feedback.trim()
        : null,
    satisfactionCollectedAt:
      raw.satisfaction_collected_at != null && String(raw.satisfaction_collected_at).trim() !== ""
        ? String(raw.satisfaction_collected_at)
        : null,
    ticketRatings: Array.isArray(raw.ticket_ratings)
      ? (raw.ticket_ratings as Record<string, unknown>[])
          .map((tr) => ({
            ratingValue: Number(tr.rating_value ?? tr.ratingValue),
            feedbackText:
              tr.feedback_text != null && String(tr.feedback_text).trim() !== ""
                ? String(tr.feedback_text).trim()
                : tr.feedbackText != null && String(tr.feedbackText).trim() !== ""
                  ? String(tr.feedbackText).trim()
                  : null,
            ratedByType: String(tr.rated_by_type ?? tr.ratedByType ?? ""),
            createdAt: String(tr.created_at ?? tr.createdAt ?? ""),
          }))
          .filter((tr) => Number.isFinite(tr.ratingValue) && tr.ratingValue >= 1 && tr.ratingValue <= 5)
      : [],
    messages: ms.map((m) => ({
      id: m.id as number,
      ticketId: (m.ticket_id ?? m.ticketId) as number,
      senderType: (m.sender_type ?? m.senderType ?? "") as string,
      senderId: (m.sender_id ?? m.senderId ?? null) as number | null,
      senderName: (m.sender_name ?? m.senderName ?? null) as string | null,
      senderEmail: (m.sender_email ?? m.senderEmail ?? null) as string | null,
      messageType: (m.message_type ?? m.messageType ?? "reply") as string,
      isInternalNote: Boolean(m.is_internal_note ?? m.isInternalNote),
      message: (m.message_text ?? m.message ?? "") as string,
      attachments: (m.attachments ?? []) as any[],
      createdAt: (m.created_at ?? "") as string,
      updatedAt: (m.updated_at ?? "") as string,
      emailRecipientTo:
        m.email_recipient_to != null && String(m.email_recipient_to).trim() !== ""
          ? String(m.email_recipient_to).trim()
          : m.emailRecipientTo != null && String(m.emailRecipientTo).trim() !== ""
            ? String(m.emailRecipientTo).trim()
            : null,
      emailRecipientCc:
        m.email_recipient_cc != null && String(m.email_recipient_cc).trim() !== ""
          ? String(m.email_recipient_cc).trim()
          : m.emailRecipientCc != null && String(m.emailRecipientCc).trim() !== ""
            ? String(m.emailRecipientCc).trim()
            : null,
      emailRecipientBcc:
        m.email_recipient_bcc != null && String(m.email_recipient_bcc).trim() !== ""
          ? String(m.email_recipient_bcc).trim()
          : m.emailRecipientBcc != null && String(m.emailRecipientBcc).trim() !== ""
            ? String(m.emailRecipientBcc).trim()
            : null,
    })),
    participants: ps.map((p) => ({
      id: p.id as number,
      ticketId: p.ticket_id as number,
      participantRole: (p.participant_role ?? "") as string,
      entityType: (p.entity_type ?? "") as string,
      customerId: (p.customer_id ?? null) as number | null,
      riderId: (p.rider_id ?? null) as number | null,
      merchantId: (p.merchant_id ?? null) as number | null,
      systemUserId: (p.system_user_id ?? null) as number | null,
      createdAt: (p.created_at ?? "") as string,
    })),
  };
}

export function useTicketDetail(ticketId: number | string | null) {
  const id =
    ticketId == null || String(ticketId).trim() === "" ? null : String(ticketId).trim();

  return useQuery<TicketDetail>({
    queryKey: queryKeys.tickets.detail(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("Ticket ID is required");
      if (ticketDetailConfirmedNotFound.has(id)) {
        throwCachedNotFound();
      }
      const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          ticketDetailConfirmedNotFound.add(id);
          const err = new Error("") as Error & { httpStatus?: number };
          err.httpStatus = 404;
          throw err;
        }
        const msg = typeof data?.error === "string" ? data.error : "Failed to fetch ticket detail";
        const err = new Error(msg) as Error & { httpStatus?: number };
        err.httpStatus = response.status;
        throw err;
      }
      const raw = data.data?.ticket;
      if (!raw) {
        const err = new Error(typeof data?.error === "string" ? data.error : "Invalid response") as Error & {
          httpStatus?: number;
        };
        err.httpStatus = response.status;
        throw err;
      }
      ticketDetailConfirmedNotFound.delete(id);
      return normalizeTicket(raw);
    },
    enabled: id != null,
    staleTime: 10000, // 10 seconds
    /**
     * One HTTP call per cache entry unless something explicitly invalidates.
     * Global default retry:1 + refetchOnMount callbacks were still hammering 404s.
     */
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
