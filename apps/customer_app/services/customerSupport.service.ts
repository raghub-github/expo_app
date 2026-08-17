/**
 * Customer support service — thin client over /v1/customer-support/*.
 * Mirrors merchant_app's ticketApi.ts so the agent dashboard sees customer
 * tickets in the same unified queue with no parallel data plane.
 */

import { api } from "./api";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS } from "@/constants";
import { guessPhotoFileMeta } from "@/lib/guess-photo-file-meta";
import { getItem } from "@/utils/storage";

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
  group_code: string | null;
  group_name: string | null;
  /** Admin-curated list of order_status codes this title is relevant for. `["NO_ORDER"]` = show in "not about an order" flow. `null` = always show. */
  applicable_order_statuses: string[] | null;
  /** Admin-configured quick-reply strings for chat / ticket intake on this title. */
  default_quick_options: string[] | null;
};

export type HelpSectionsQuery = {
  orderStatus?: string;
  serviceType?: string;
  groupCode?: string;
  groupName?: string;
  parentTitleId?: "root" | number;
  intakeOnly?: boolean;
  folderTitle?: string;
  titleCode?: string;
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
  cancelled_at?: string | null;
  merchant_store_id: number | null;
  merchant_store_name: string | null;
  customer_name?: string | null;
  item_preview?: string | null;
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

export type TicketMessageAttachmentInput =
  | string
  | TicketAttachment;

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

export type FraudReportTargetType = "merchant" | "rider";

export type FraudReportOption = {
  option_code: string;
  option_text: string;
  display_order: number;
  requires_details: boolean;
};

export type SupportChatSession = {
  id: number;
  order_id: number | null;
  ticket_id: number | null;
  ticket_title_id: number | null;
  selected_issue_label: string | null;
  status: "active" | "submitted" | "ended" | string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type SupportChatMessageRecord = {
  id: number;
  client_message_id: string | null;
  role: "bot" | "user";
  message_text: string;
  menu_level: string | null;
  payload: Record<string, unknown>;
  display_order: number;
  created_at: string;
};

export type SupportChatSessionResponse = {
  session: SupportChatSession;
  messages: SupportChatMessageRecord[];
  resumed?: boolean;
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
  async getHelpSections(
    orderStatusOrQuery?: string | HelpSectionsQuery,
    serviceType?: string
  ): Promise<HelpSection[]> {
    const params: Record<string, string> = {};
    if (typeof orderStatusOrQuery === "string") {
      if (orderStatusOrQuery) params.order_status = orderStatusOrQuery;
      if (serviceType) params.service_type = serviceType;
    } else if (orderStatusOrQuery) {
      if (orderStatusOrQuery.orderStatus) params.order_status = orderStatusOrQuery.orderStatus;
      if (orderStatusOrQuery.serviceType) params.service_type = orderStatusOrQuery.serviceType;
      if (orderStatusOrQuery.groupCode) params.group_code = orderStatusOrQuery.groupCode;
      if (orderStatusOrQuery.groupName) params.group_name = orderStatusOrQuery.groupName;
      if (orderStatusOrQuery.parentTitleId === "root") {
        params.parent_title_id = "root";
      } else if (
        typeof orderStatusOrQuery.parentTitleId === "number" &&
        Number.isFinite(orderStatusOrQuery.parentTitleId)
      ) {
        params.parent_title_id = String(orderStatusOrQuery.parentTitleId);
      }
      if (orderStatusOrQuery.intakeOnly) params.intake_only = "true";
      if (orderStatusOrQuery.folderTitle) params.folder_title = orderStatusOrQuery.folderTitle;
      if (orderStatusOrQuery.titleCode) params.title_code = orderStatusOrQuery.titleCode;
    }
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
    display_order_id?: string | null;
    selected_issue_label?: string | null;
    chat_session_id?: number | null;
  }): Promise<{ id: number; ticket_id: string; status: string; priority: string }> {
    const { data } = await api.post<{
      ok: boolean;
      ticket: { id: number; ticket_id: string; status: string; priority: string };
    }>(`${PREFIX}/tickets`, payload);
    return data.ticket;
  },

  /** Create ticket, upload up to 3 photos, and post opening message with attachment rows. */
  async createTicketWithPhotos(payload: {
    ticket_title_id: number;
    section_code?: string;
    subject: string;
    description: string;
    order_id?: number | null;
    display_order_id?: string | null;
    selected_issue_label?: string | null;
    photo_uris?: string[];
    chat_session_id?: number | null;
  }): Promise<{ id: number; ticket_id: string; status: string; priority: string }> {
    const photoUris = (payload.photo_uris ?? []).filter((uri) => uri.trim().length > 0).slice(0, 3);
    const ticket = await customerSupportService.createTicket({
      ticket_title_id: payload.ticket_title_id,
      section_code: payload.section_code,
      subject: payload.subject,
      description: payload.description,
      order_id: payload.order_id,
      display_order_id: payload.display_order_id,
      selected_issue_label: payload.selected_issue_label,
      chat_session_id: payload.chat_session_id,
    });

    const attachments: TicketAttachment[] = [];
    for (let i = 0; i < photoUris.length; i++) {
      const uri = photoUris[i];
      const meta = guessPhotoFileMeta(uri, i);
      try {
        const uploaded = await customerSupportService.uploadAttachment(ticket.id, {
          uri,
          name: meta.name,
          mimeType: meta.mimeType,
        });
        attachments.push({
          storageKey: uploaded.storageKey,
          url: uploaded.url,
          name: uploaded.name || meta.name,
          mimeType: uploaded.mimeType || meta.mimeType,
        });
      } catch (err) {
        if (__DEV__) {
          console.warn("[customer-support] photo upload failed", err);
        }
      }
    }

    const desc = payload.description.trim();
    const issueLabel = (payload.selected_issue_label ?? "").trim();
    // Skip opening chat message when body is only the catalog issue title (already on ticket subject).
    const descIsIssueTitleOnly =
      issueLabel.length > 0 && desc.toLowerCase() === issueLabel.toLowerCase();
    if ((desc && !descIsIssueTitleOnly) || attachments.length > 0) {
      try {
        await customerSupportService.sendMessage(ticket.id, {
          message_text:
            desc && !descIsIssueTitleOnly
              ? desc
              : attachments.length > 1
                ? "Shared attachments"
                : "Shared an attachment",
          attachments: attachments.length ? attachments : undefined,
        });
      } catch (err) {
        if (__DEV__) {
          console.warn("[customer-support] opening message failed", err);
        }
      }
    }

    return ticket;
  },

  async getFraudReportOptions(target: FraudReportTargetType): Promise<FraudReportOption[]> {
    const { data } = await api.get<{
      ok: boolean;
      options: FraudReportOption[];
    }>(`${PREFIX}/fraud-report-options`, {
      params: { target },
    });
    return data.options ?? [];
  },

  async submitFraudReport(payload: {
    order_id: number;
    target_type: FraudReportTargetType;
    option_codes: string[];
    custom_details?: string;
  }): Promise<{ id: number; ticket_id: string; status: string; priority: string }> {
    const { data } = await api.post<{
      ok: boolean;
      ticket: { id: number; ticket_id: string; status: string; priority: string };
    }>(`${PREFIX}/fraud-reports`, payload);
    return data.ticket;
  },

  /** Reply on a ticket. Attachments mirror rider support rows for dashboard + R2 proxy. */
  async sendMessage(
    ticketId: number | string,
    payload: { message_text: string; attachments?: TicketMessageAttachmentInput[] }
  ): Promise<TicketMessage> {
    const { data } = await api.post<{ ok: boolean; message: TicketMessage }>(
      `${PREFIX}/tickets/${ticketId}/messages`,
      payload
    );
    return data.message;
  },

  /**
   * Upload an attachment (multipart) to R2 — same pattern as rider support app.
   * Uses fetch (not axios) so React Native sets the multipart boundary correctly.
   */
  async uploadAttachment(
    ticketId: number | string,
    file: { uri: string; name: string; mimeType: string }
  ): Promise<{ storageKey: string; url: string; name: string; mimeType: string }> {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) throw new Error("Not authenticated");

    const form = new FormData();
    form.append(
      "file",
      { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob
    );

    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}${PREFIX}/tickets/${ticketId}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status})${text ? `: ${text}` : ""}`);
    }

    const data = (await res.json()) as {
      ok: boolean;
      attachment: { storageKey: string; url: string; name: string; mimeType: string };
    };
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

  /** Create or resume an active support chat session for an order. */
  async ensureSupportChatSession(payload: {
    order_id?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<SupportChatSessionResponse> {
    const { data } = await api.post<{
      ok: boolean;
      session: SupportChatSession;
      messages: SupportChatMessageRecord[];
      resumed?: boolean;
    }>(`${PREFIX}/support-chat/sessions`, payload);
    return {
      session: data.session,
      messages: data.messages ?? [],
      resumed: data.resumed,
    };
  },

  async getSupportChatSession(sessionId: number | string): Promise<SupportChatSessionResponse> {
    const { data } = await api.get<{
      ok: boolean;
      session: SupportChatSession;
      messages: SupportChatMessageRecord[];
    }>(`${PREFIX}/support-chat/sessions/${sessionId}`);
    return { session: data.session, messages: data.messages ?? [] };
  },

  async patchSupportChatSession(
    sessionId: number | string,
    payload: {
      order_id?: number | null;
      ticket_title_id?: number | null;
      selected_issue_label?: string | null;
      ticket_id?: number | null;
      status?: "active" | "submitted" | "ended";
    }
  ): Promise<SupportChatSession> {
    const { data } = await api.patch<{ ok: boolean; session: SupportChatSession }>(
      `${PREFIX}/support-chat/sessions/${sessionId}`,
      payload
    );
    return data.session;
  },

  async appendSupportChatMessage(
    sessionId: number | string,
    payload: {
      client_message_id?: string;
      role: "bot" | "user";
      message_text: string;
      menu_level?: string | null;
      payload?: Record<string, unknown>;
    }
  ): Promise<SupportChatMessageRecord> {
    const { data } = await api.post<{ ok: boolean; message: SupportChatMessageRecord }>(
      `${PREFIX}/support-chat/sessions/${sessionId}/messages`,
      payload
    );
    return data.message;
  },
};
