"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  serviceType: string;
  ticketCategory: string;
  ticketSection: string;
  sourceRole: string;
  title: {
    id: number;
    titleText: string;
    description: string | null;
  } | null;
  subject: string;
  description: string;
  /** Name of the user/source who raised the ticket (for "Created by X"). */
  raisedByName: string | null;
  /** Email of the user who raised the ticket (for "To:" in conversation). */
  raisedByEmail: string | null;
  status: string;
  priority: string;
  orderId: number | null;
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
  message: string;
  attachments: any[];
  createdAt: string;
  updatedAt: string;
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

  return {
    id: raw.id as number,
    ticketNumber: (raw.ticket_number ?? raw.ticket_id ?? raw.id) as string,
    serviceType: (raw.service_type ?? "") as string,
    ticketCategory: (raw.ticket_category ?? "") as string,
    ticketSection: (raw.ticket_section ?? "") as string,
    sourceRole: (raw.source_role ?? raw.raised_by_type ?? "") as string,
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
    raisedByEmail: (raw.raised_by_email ?? null) as string | null,
    status,
    priority,
    orderId: (raw.order_id ?? null) as number | null,
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
    group: g && typeof g.id === "number" ? { id: g.id, groupCode: g.groupCode ?? "", groupName: g.groupName ?? "" } : null,
    attachments,
    slaDueAt: (raw.sla_due_at ?? null) as string | null,
    resolvedAt: (raw.resolved_at ?? null) as string | null,
    closedAt: (raw.closed_at ?? null) as string | null,
    createdAt: (raw.created_at ?? "") as string,
    updatedAt: (raw.updated_at ?? "") as string,
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
    messages: ms.map((m) => ({
      id: m.id as number,
      ticketId: (m.ticket_id ?? m.ticketId) as number,
      senderType: (m.sender_type ?? m.senderType ?? "") as string,
      senderId: (m.sender_id ?? m.senderId ?? null) as number | null,
      senderName: (m.sender_name ?? m.senderName ?? null) as string | null,
      senderEmail: (m.sender_email ?? m.senderEmail ?? null) as string | null,
      messageType: (m.message_type ?? m.messageType ?? "reply") as string,
      message: (m.message_text ?? m.message ?? "") as string,
      attachments: (m.attachments ?? []) as any[],
      createdAt: (m.created_at ?? "") as string,
      updatedAt: (m.updated_at ?? "") as string,
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

export function useTicketDetail(ticketId: number | null) {
  return useQuery<TicketDetail>({
    queryKey: queryKeys.tickets.detail(ticketId || ""),
    queryFn: async () => {
      if (!ticketId) throw new Error("Ticket ID is required");
      const response = await fetch(`/api/tickets/${ticketId}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.error ?? (response.status === 404 ? "Ticket not found" : "Failed to fetch ticket detail");
        throw new Error(msg);
      }
      const raw = data.data?.ticket;
      if (!raw) throw new Error(data?.error ?? "Invalid response");
      return normalizeTicket(raw);
    },
    enabled: !!ticketId,
    staleTime: 10000, // 10 seconds
  });
}
