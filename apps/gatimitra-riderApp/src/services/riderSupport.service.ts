import { getRiderAppConfig } from "@/src/config/env";
import { getJson, postJson, HttpError } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";

export function guessPhotoFileMeta(uri: string, index: number): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return { name: `photo-${index + 1}.png`, mimeType: "image/png" };
  if (lower.includes(".webp")) return { name: `photo-${index + 1}.webp`, mimeType: "image/webp" };
  if (lower.includes(".gif")) return { name: `photo-${index + 1}.gif`, mimeType: "image/gif" };
  return { name: `photo-${index + 1}.jpg`, mimeType: "image/jpeg" };
}

const PREFIX = () => `${getRiderAppConfig().apiBaseUrl}/v1/rider-support`;

function authHeaders() {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) throw new Error("Not authenticated");
  return { authorization: `Bearer ${token}` };
}

function optionalAuthHeaders(): Record<string, string> {
  const token = useSessionStore.getState().session?.accessToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Mirrors customer_support HelpSection — from ticket_titles + ticket_groups. */
export type RiderHelpSection = {
  ticket_title_id: number;
  title_code: string | null;
  title_text: string | null;
  subtext: string | null;
  section_id: string | null;
  display_order: number | null;
  group_id: number | null;
  group_code: string | null;
  group_name: string | null;
  parent_title_id: number | null;
  intake_ticket_type: string | null;
  requires_order: boolean;
  /** True when dashboard tree has nested titles under this row. */
  has_children: boolean;
  applicable_order_statuses: string[] | null;
};

export type RiderHelpGroup = {
  group_id: number;
  group_code: string;
  group_name: string;
  group_description: string | null;
  display_order: number | null;
  ticket_category: string | null;
};

export type RiderRecentOrder = {
  id: number;
  order_id: string | null;
  formatted_order_id: string | null;
  status: string;
  current_status: string | null;
  grand_total: number | null;
  placed_at: string | null;
  delivered_at: string | null;
  merchant_store_name: string | null;
};

export type RiderTicketListItem = {
  id: number;
  ticket_id: string;
  status: string;
  priority: string;
  ticket_title: string | null;
  ticket_category?: string | null;
  subject: string | null;
  description: string | null;
  order_id: number | null;
  created_at: string;
  updated_at: string | null;
  resolved_at?: string | null;
  last_response_at: string | null;
  last_response_by_type: string | null;
  satisfaction_rating?: number | null;
  satisfaction_feedback?: string | null;
  satisfaction_collected_at?: string | null;
};

export type RiderTicketMessage = {
  id: number;
  message_text: string;
  message_type: string;
  sender_type: string | null;
  sender_id: number | null;
  sender_name: string | null;
  attachments: unknown[];
  created_at: string;
};

export type RiderTicketDetailResponse = {
  ticket: RiderTicketListItem;
  messages: RiderTicketMessage[];
};

export const riderSupportService = {
  async getHelpGroups() {
    const data = await getJson<{ ok: boolean; groups: RiderHelpGroup[] }>(
      `${PREFIX()}/help-groups`,
      { headers: optionalAuthHeaders() },
    );
    return data.groups ?? [];
  },

  async getHelpSections(params?: {
    section?: string;
    group_code?: string;
    parent_title_id?: number | "root" | null;
    order_status?: string;
    /** When true, only titles that can be selected to raise a ticket (no child rows). */
    intake_only?: boolean;
    /** All titles under group_code at any tree depth (dashboard Help topics children). */
    all_in_group?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.section) q.set("section", params.section);
    if (params?.group_code) q.set("group_code", params.group_code);
    if (params?.intake_only) q.set("intake_only", "true");
    if (params?.all_in_group) q.set("all_in_group", "true");
    if (params?.parent_title_id === "root") {
      q.set("parent_title_id", "root");
    } else if (typeof params?.parent_title_id === "number") {
      q.set("parent_title_id", String(params.parent_title_id));
    }
    if (params?.order_status) q.set("order_status", params.order_status);
    const data = await getJson<{ ok: boolean; sections: RiderHelpSection[] }>(
      `${PREFIX()}/help-sections?${q.toString()}`,
      { headers: optionalAuthHeaders() },
    );
    return data.sections ?? [];
  },

  async getRecentOrders(params?: {
    limit?: number;
    offset?: number;
    scope?: "active" | "completed" | "all";
  }) {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.scope) q.set("scope", params.scope);
    return getJson<{
      ok: boolean;
      orders: RiderRecentOrder[];
      hasMore: boolean;
    }>(`${PREFIX()}/recent-orders?${q.toString()}`, { headers: authHeaders() });
  },

  async listTickets() {
    const data = await getJson<{ ok: boolean; tickets: RiderTicketListItem[] }>(
      `${PREFIX()}/tickets`,
      { headers: authHeaders() },
    );
    return data.tickets ?? [];
  },

  async getTicket(ticketId: number): Promise<RiderTicketDetailResponse> {
    const data = await getJson<{
      ok: boolean;
      ticket: RiderTicketListItem;
      messages: RiderTicketMessage[];
    }>(`${PREFIX()}/tickets/${ticketId}/messages`, { headers: authHeaders() });
    return { ticket: data.ticket, messages: data.messages ?? [] };
  },

  async sendMessage(
    ticketId: number,
    payload: {
      message_text: string;
      attachments?: Array<{
        storageKey: string;
        name: string;
        mimeType: string;
        url?: string;
      }>;
    },
    options?: { preLogin?: boolean },
  ) {
    return postJson<{ ok: boolean; message: RiderTicketMessage }>(
      `${PREFIX()}/tickets/${ticketId}/messages`,
      payload,
      { headers: options?.preLogin ? optionalAuthHeaders() : authHeaders() },
    );
  },

  async uploadAttachment(
    ticketId: number,
    file: { uri: string; name: string; mimeType: string },
    options?: { preLogin?: boolean },
  ): Promise<{ storageKey: string; url: string; name: string; mimeType: string }> {
    const token = useSessionStore.getState().session?.accessToken;
    if (!token && !options?.preLogin) throw new Error("Not authenticated");

    const form = new FormData();
    form.append(
      "file",
      { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob,
    );

    const res = await fetch(`${PREFIX()}/tickets/${ticketId}/upload`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new HttpError(
        `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
        res.status,
        text,
      );
    }

    const data = (await res.json()) as {
      ok: boolean;
      attachment: { storageKey: string; url: string; name: string; mimeType: string };
    };
    return data.attachment;
  },

  async rateTicket(ticketId: number, rating: number, feedback?: string) {
    const data = await postJson<{ ok: boolean; ticket: RiderTicketListItem }>(
      `${PREFIX()}/tickets/${ticketId}/rating`,
      {
        rating,
        feedback: feedback?.trim() ? feedback.trim() : undefined,
      },
      { headers: authHeaders() },
    );
    return data.ticket;
  },

  async reopenTicket(ticketId: number) {
    const data = await postJson<{ ok: boolean; ticket: RiderTicketListItem }>(
      `${PREFIX()}/tickets/${ticketId}/reopen`,
      {},
      { headers: authHeaders() },
    );
    return data.ticket;
  },

  async createTicket(payload: {
    ticket_title_id?: number;
    section_code?: string;
    title_code?: string;
    subject: string;
    description: string;
    order_id?: number | null;
    photo_uris?: string[];
    pre_login?: boolean;
    raised_by_name?: string;
    raised_by_mobile?: string;
    raised_by_email?: string;
  }) {
    const body = {
      ...(payload.ticket_title_id != null ? { ticket_title_id: payload.ticket_title_id } : {}),
      section_code: payload.section_code,
      title_code: payload.title_code,
      subject: payload.subject,
      description: payload.description,
      order_id: payload.order_id ?? null,
      photo_uris: payload.photo_uris?.length ? payload.photo_uris : undefined,
      ...(payload.pre_login
        ? {
            pre_login: true,
            raised_by_name: payload.raised_by_name,
            raised_by_mobile: payload.raised_by_mobile,
            raised_by_email: payload.raised_by_email,
          }
        : {}),
    };
    return postJson<{ ok: boolean; ticket: RiderTicketListItem }>(
      `${PREFIX()}/tickets`,
      body,
      { headers: payload.pre_login ? optionalAuthHeaders() : authHeaders() },
    );
  },

  /** Create ticket, upload photos to R2, and post opening chat message with attachments. */
  async createTicketWithPhotos(payload: {
    ticket_title_id?: number;
    section_code?: string;
    title_code?: string;
    subject: string;
    description: string;
    order_id?: number | null;
    photo_uris?: string[];
    pre_login?: boolean;
    raised_by_name?: string;
    raised_by_mobile?: string;
    raised_by_email?: string;
  }) {
    const preLogin = payload.pre_login === true;
    const photoUris = (payload.photo_uris ?? []).filter((u) => u.trim().length > 0).slice(0, 5);
    const res = await riderSupportService.createTicket({
      ...payload,
      photo_uris: undefined,
    });
    const ticketId = res.ticket.id;
    const attachments: Array<{
      storageKey: string;
      name: string;
      mimeType: string;
      url: string;
    }> = [];

    for (let i = 0; i < photoUris.length; i++) {
      const uri = photoUris[i];
      const meta = guessPhotoFileMeta(uri, i);
      try {
        const uploaded = await riderSupportService.uploadAttachment(
          ticketId,
          {
            uri,
            name: meta.name,
            mimeType: meta.mimeType,
          },
          { preLogin },
        );
        attachments.push({
          storageKey: uploaded.storageKey,
          name: uploaded.name || meta.name,
          mimeType: uploaded.mimeType || meta.mimeType,
          url: uploaded.url,
        });
      } catch {
        // Ticket already created; skip failed upload and continue with others.
      }
    }

    const desc = payload.description.trim();
    if (desc || attachments.length > 0) {
      try {
        await riderSupportService.sendMessage(
          ticketId,
          {
            message_text:
              desc || (attachments.length > 1 ? "Shared attachments" : "Shared an attachment"),
            attachments: attachments.length ? attachments : undefined,
          },
          { preLogin },
        );
      } catch {
        // Opening message is optional if ticket row + description already exist.
      }
    }

    return res;
  },
};
