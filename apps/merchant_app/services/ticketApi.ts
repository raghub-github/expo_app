import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type TicketSummary = {
  id: number;
  ticket_id: string;
  status: string;
  priority: string;
  created_at: string;
  created_at_display?: string;
  ticket_title?: string;
  ticket_category?: string;
};

export type TicketMessage = {
  id: number;
  message_text: string;
  message_type: string;
  sender_type: string;
  sender_id: number | null;
  sender_name: string | null;
  attachments: string[];
  created_at: string;
};

export async function createStoreTicket(
  storeId: number,
  sectionCode: string,
  token: string,
  opts?: { subject?: string; description?: string; orderId?: number | null }
): Promise<TicketSummary> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        section_code: sectionCode,
        subject: opts?.subject,
        description: opts?.description,
        order_id: opts?.orderId ?? null,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to create support ticket"
    );
  }
  const data = (await res.json()) as { ok?: boolean; ticket: TicketSummary };
  return data.ticket;
}

export async function getStoreTickets(
  storeId: number,
  token: string
): Promise<TicketSummary[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load tickets"
    );
  }
  const data = (await res.json()) as { tickets: TicketSummary[] };
  return data.tickets;
}

export async function getTicketMessages(
  storeId: number,
  ticketId: number,
  token: string
): Promise<{ ticket: TicketSummary; messages: TicketMessage[] }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/messages`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load ticket messages"
    );
  }
  return (await res.json()) as {
    ticket: TicketSummary;
    messages: TicketMessage[];
  };
}

export async function postTicketMessage(
  storeId: number,
  ticketId: number,
  messageText: string,
  token: string,
  attachments?: string[]
): Promise<TicketMessage> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/tickets/${ticketId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message_text: messageText,
        attachments: attachments && attachments.length ? attachments : undefined,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to send message"
    );
  }
  const data = (await res.json()) as {
    ok?: boolean;
    message: { id: number; message_text: string; created_at: string };
  };
  return {
    id: data.message.id,
    message_text: data.message.message_text,
    message_type: "TEXT",
    sender_type: "MERCHANT",
    sender_id: null,
    sender_name: null,
    attachments: attachments ?? [],
    created_at: data.message.created_at,
  };
}

