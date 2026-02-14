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
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  participants: TicketParticipant[];
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderType: string;
  senderId: number | null;
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
  const ms = (raw.messages ?? []) as Record<string, unknown>[];
  const ps = (raw.participants ?? []) as Record<string, unknown>[];
  return {
    id: raw.id as number,
    ticketNumber: (raw.ticket_number ?? raw.id) as string,
    serviceType: (raw.service_type ?? "") as string,
    ticketCategory: (raw.ticket_category ?? "") as string,
    ticketSection: (raw.ticket_section ?? "") as string,
    sourceRole: (raw.source_role ?? "") as string,
    title: t
      ? {
          id: t.id as number,
          titleText: (t.title_text ?? t.titleText ?? "") as string,
          description: (t.description ?? null) as string | null,
        }
      : null,
    subject: (raw.subject ?? "") as string,
    description: (raw.description ?? "") as string,
    status: (raw.status ?? "open") as string,
    priority: (raw.priority ?? "medium") as string,
    orderId: (raw.order_id ?? null) as number | null,
    orderServiceType: (raw.order_service_type ?? null) as string | null,
    is3plOrder: (raw.is_3pl_order ?? false) as boolean,
    isHighValueOrder: (raw.is_high_value_order ?? false) as boolean,
    assignee: a
      ? {
          id: a.id as number,
          name: (a.full_name ?? a.name ?? "") as string,
          email: (a.email ?? "") as string,
        }
      : null,
    slaDueAt: (raw.sla_due_at ?? null) as string | null,
    resolvedAt: (raw.resolved_at ?? null) as string | null,
    closedAt: (raw.closed_at ?? null) as string | null,
    createdAt: (raw.created_at ?? "") as string,
    updatedAt: (raw.updated_at ?? "") as string,
    messages: ms.map((m) => ({
      id: m.id as number,
      ticketId: m.ticket_id as number,
      senderType: (m.sender_type ?? "") as string,
      senderId: (m.sender_id ?? null) as number | null,
      messageType: (m.message_type ?? "reply") as string,
      message: (m.message ?? "") as string,
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
      
      const response = await fetch(`/api/tickets/${ticketId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch ticket detail");
      }
      const data = await response.json();
      const raw = data.data?.ticket;
      if (!raw) throw new Error("Invalid response");
      return normalizeTicket(raw);
    },
    enabled: !!ticketId,
    staleTime: 10000, // 10 seconds
  });
}
