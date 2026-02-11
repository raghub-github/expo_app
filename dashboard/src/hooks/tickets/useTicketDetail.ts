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
      return data.data.ticket;
    },
    enabled: !!ticketId,
    staleTime: 10000, // 10 seconds
  });
}
