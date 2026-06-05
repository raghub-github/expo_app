/**
 * Customer support service — thin client over /v1/customer-support/*.
 * Mirrors merchant_app's ticketApi.ts so the agent dashboard sees customer
 * tickets in the same unified queue with no parallel data plane.
 */

import { api } from "./api";

const PREFIX = "/v1/customer-support";

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "WAITING_FOR_MERCHANT"
  | "WAITING_FOR_RIDER"
  | "PENDING"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "REJECTED"
  | "SNOOZED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | "CRITICAL";

export type HelpSection = {
  ticket_title_id: number;
  title_code: string | null;
  title_text: string | null;
  section_id: string | null;
  display_order: number | null;
  group_id: number | null;
  group_name: string | null;
  /** Admin-curated list of order_status codes this title is relevant for. `["NO_ORDER"]` = show in "not about an order" flow. `null` = always show. */
  applicable_order_statuses: string[] | null;
};

export type RecentOrder = {
  id: number;
  order_id: string | null;
  formatted_order_id?: string | null;
  order_type?: string | null;
  status: string;
  current_status: string | null;
  grand_total: number | null;
  placed_at: string | null;
  delivered_at: string | null;
  merchant_store_id: number | null;
  merchant_store_name: string | null;
};

export type TicketListItem = {
  id: number;
  ticket_id: string;
  status: TicketStatus | string;
  priority: TicketPriority | string;
  ticket_title: string | null;
  ticket_category: string | null;
  subject: string | null;
  description: string | null;
  order_id: number | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
  last_response_at: string | null;
  last_response_by_type: string | null;
};

export type TicketAttachment = {
  storageKey?: string;
  url?: string;
  name?: string;
  mimeType?: string;
};

export type TicketMessage = {
  id: number;
  message_text: string;
  message_type: string;
  sender_type: string | null;
  sender_id: number | null;
  sender_name: string | null;
  attachments: Array<string | TicketAttachment>;
  created_at: string;
};

export type TicketDetail = {
  id: number;
  ticket_id: string;
  status: TicketStatus | string;
  priority: TicketPriority | string;
  ticket_title: string | null;
  ticket_category: string | null;
  subject: string | null;
  description: string | null;
  order_id: number | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
  first_response_at: string | null;
  sla_due_at: string | null;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;
  satisfaction_collected_at: string | null;
  snoozed_until: string | null;
  snooze_reason: string | null;
};

export type TicketDetailResponse = {
  ok: true;
  ticket: TicketDetail;
  messages: TicketMessage[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Service                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export const customerSupportService = {
  /**
   * Title catalog. Optionally pass an `orderStatus` filter to get only
   * status-relevant titles (e.g. "delivered" returns "Missing item / Wrong
   * item / Damaged / Food quality / Refund request"). Pass `"NO_ORDER"` for
   * the not-about-an-order flow. Omit for the full catalog (section picker).
   */
  async getHelpSections(orderStatus?: string, serviceType?: string): Promise<HelpSection[]> {
    const params: Record<string, string> = {};
    if (orderStatus) params.order_status = orderStatus;
    if (serviceType) params.service_type = serviceType;
    const { data } = await api.get<{ ok: boolean; sections: HelpSection[] }>(`${PREFIX}/help-sections`, {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return data.sections ?? [];
  },

  /** Paginated recent orders for the order-picker step (3 at a time by default). */
  async getRecentOrders(params?: { limit?: number; offset?: number }): Promise<{ orders: RecentOrder[]; hasMore: boolean }> {
    const { data } = await api.get<{ ok: boolean; orders: RecentOrder[]; hasMore: boolean }>(
      `${PREFIX}/recent-orders`,
      { params }
    );
    return { orders: data.orders ?? [], hasMore: !!data.hasMore };
  },

  /** Resolve order by id, GM…, or GMF… for order-linked tickets. */
  async resolveOrderForTicket(ref: string): Promise<RecentOrder | null> {
    const trimmed = ref.replace(/^#/, "").trim();
    if (!trimmed) return null;
    try {
      const { data } = await api.get<{ ok: boolean; order: RecentOrder }>(`${PREFIX}/orders/resolve`, {
        params: { ref: trimmed },
      });
      return data.order ?? null;
    } catch {
      return null;
    }
  },

  /** List the customer's tickets. */
  async listTickets(params?: { status?: string; limit?: number; offset?: number }): Promise<TicketListItem[]> {
    const { data } = await api.get<{ ok: boolean; tickets: TicketListItem[] }>(`${PREFIX}/tickets`, {
      params,
    });
    return data.tickets ?? [];
  },

  /** Get a single ticket + its full (non-internal) message history. */
  async getTicket(ticketId: number | string): Promise<TicketDetailResponse> {
    const { data } = await api.get<TicketDetailResponse>(`${PREFIX}/tickets/${ticketId}/messages`);
    return data;
  },

  /** Raise a new ticket (general or order-linked). */
  async createTicket(payload: {
    ticket_title_id?: number | null;
    section_code?: string;
    subject: string;
    description: string;
    order_id?: number | null;
  }): Promise<{ id: number; ticket_id: string; status: string; priority: string }> {
    const { data } = await api.post<{
      ok: boolean;
      ticket: { id: number; ticket_id: string; status: string; priority: string };
    }>(`${PREFIX}/tickets`, payload);
    return data.ticket;
  },

  /** Reply on a ticket. attachments is an array of storage keys returned by upload. */
  async sendMessage(
    ticketId: number | string,
    payload: { message_text: string; attachments?: string[] }
  ): Promise<TicketMessage> {
    const { data } = await api.post<{ ok: boolean; message: TicketMessage }>(
      `${PREFIX}/tickets/${ticketId}/messages`,
      payload
    );
    return data.message;
  },

  /**
   * Upload an attachment (multipart). React Native's `FormData` accepts the
   * `{ uri, name, type }` shape directly.
   */
  async uploadAttachment(
    ticketId: number | string,
    file: { uri: string; name: string; mimeType: string }
  ): Promise<{ storageKey: string; url: string; name: string; mimeType: string }> {
    const form = new FormData();
    form.append(
      "file",
      // RN FormData accepts this shape — TS types are too narrow.
      { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob
    );
    const { data } = await api.post<{
      ok: boolean;
      attachment: { storageKey: string; url: string; name: string; mimeType: string };
    }>(`${PREFIX}/tickets/${ticketId}/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      transformRequest: (d) => d,
    });
    return data.attachment;
  },

  /** CSAT 1–5. Only valid on RESOLVED/CLOSED tickets. */
  async rateTicket(ticketId: number | string, rating: number, feedback?: string): Promise<void> {
    await api.post(`${PREFIX}/tickets/${ticketId}/rating`, { rating, feedback });
  },

  /** Reopen a RESOLVED ticket. */
  async reopen(ticketId: number | string): Promise<void> {
    await api.post(`${PREFIX}/tickets/${ticketId}/reopen`, {});
  },
};
