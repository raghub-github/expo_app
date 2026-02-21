/**
 * Support tickets – list (by customer), create, get one.
 * Persists to public.unified_tickets; backend resolves customer_id from JWT.
 *
 * Backend contract:
 * - GET /v1/support/tickets → { tickets: TicketListItem[], total?: number } (filter by customer_id from auth).
 * - POST /v1/support/tickets → body: { subject, description, ticket_title? } → insert into unified_tickets
 *   with raised_by_type=CUSTOMER, ticket_type=NON_ORDER_RELATED, ticket_source=APP, service_type=FOOD, etc.
 * - GET /v1/support/tickets/:id → TicketDetail (ensure customer_id matches auth).
 */

import api from "./api";

const TICKETS_PREFIX = "/v1/support/tickets";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH";

export type TicketListItem = {
  id: number;
  ticket_id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
};

export type TicketDetail = TicketListItem & {
  raised_by_name?: string | null;
  raised_by_mobile?: string | null;
  raised_by_email?: string | null;
  resolution?: string | null;
  assigned_to_agent_name?: string | null;
};

export type CreateTicketPayload = {
  subject: string;
  description: string;
  ticket_title?: string;
};

export const ticketService = {
  async getMyTickets(params?: { limit?: number; offset?: number }): Promise<{ tickets: TicketListItem[]; total?: number }> {
    const { data } = await api.get<{ tickets: TicketListItem[]; total?: number }>(TICKETS_PREFIX, { params });
    return data;
  },

  async createTicket(payload: CreateTicketPayload): Promise<{ id: number; ticket_id: string }> {
    const { data } = await api.post<{ id: number; ticket_id: string }>(TICKETS_PREFIX, payload);
    return data;
  },

  async getTicket(id: number | string): Promise<TicketDetail> {
    const { data } = await api.get<TicketDetail>(`${TICKETS_PREFIX}/${id}`);
    return data;
  },
};
