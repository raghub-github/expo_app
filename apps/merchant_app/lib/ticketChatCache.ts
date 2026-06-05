import type { TicketMessage, TicketSummary } from "@/services/ticketApi";

export function normalizeTicketMessages(
  ticket: TicketSummary,
  messages: TicketMessage[],
  ticketId: number
): TicketMessage[] {
  const fallbackCreatedAt = ticket?.created_at ?? new Date().toISOString();
  const normalizedMessages = (messages ?? []).map((m) => ({
    ...m,
    created_at:
      typeof m.created_at === "string" && m.created_at.trim()
        ? m.created_at.trim()
        : fallbackCreatedAt,
  }));
  const description = (ticket?.description ?? "").trim();
  const normalizedDescription = description.replace(/\r\n/g, "\n");
  const hasSameMerchantMessage = normalizedMessages.some((m) => {
    if (String(m.sender_type ?? "").toUpperCase() !== "MERCHANT") return false;
    const body = String(m.message_text ?? "").trim().replace(/\r\n/g, "\n");
    return body === normalizedDescription;
  });
  if (normalizedDescription.length > 0 && !hasSameMerchantMessage) {
    return [
      {
        id: -(ticket?.id ?? ticketId),
        message_text: description,
        message_type: "TEXT",
        sender_type: "MERCHANT",
        sender_id: null,
        sender_name: null,
        attachments: [],
        created_at: ticket?.created_at ?? new Date().toISOString(),
      } as TicketMessage,
      ...normalizedMessages,
    ];
  }
  return normalizedMessages;
}

type CachedTicketChat = {
  ticket: TicketSummary;
  messages: TicketMessage[];
  cachedAt: number;
};

const CACHE = new Map<string, CachedTicketChat>();
const TTL_MS = 15 * 60 * 1000;

function cacheKey(storeId: number, ticketId: number): string {
  return `${storeId}:${ticketId}`;
}

export function getCachedTicketChat(
  storeId: number,
  ticketId: number
): CachedTicketChat | null {
  const entry = CACHE.get(cacheKey(storeId, ticketId));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    CACHE.delete(cacheKey(storeId, ticketId));
    return null;
  }
  return entry;
}

export function setCachedTicketChat(
  storeId: number,
  ticketId: number,
  ticket: TicketSummary,
  messages: TicketMessage[]
): void {
  CACHE.set(cacheKey(storeId, ticketId), {
    ticket,
    messages,
    cachedAt: Date.now(),
  });
}

export function clearCachedTicketChat(storeId: number, ticketId: number): void {
  CACHE.delete(cacheKey(storeId, ticketId));
}
