export type PartnerChatCacheMessage = {
  id: number;
  senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
  body: string;
  createdAt: string;
};

export type PartnerChatCacheEntry = {
  messages: PartnerChatCacheMessage[];
  chatClosed: boolean;
};

const EMPTY_ENTRY: PartnerChatCacheEntry = {
  messages: [],
  chatClosed: false,
};

const cache = new Map<number, PartnerChatCacheEntry>();
const inflight = new Map<number, Promise<PartnerChatCacheEntry>>();

export function seedPartnerChatCache(orderId: number, entry: PartnerChatCacheEntry): void {
  if (!Number.isFinite(orderId)) return;
  cache.set(orderId, entry);
}

export function getCachedPartnerChat(orderId: number): PartnerChatCacheEntry | undefined {
  return cache.get(orderId);
}

export function prefetchPartnerChat(orderId: number): void {
  if (!Number.isFinite(orderId)) return;
  if (cache.has(orderId) || inflight.has(orderId)) return;
  void fetchPartnerChatCached(orderId);
}

export async function fetchPartnerChatCached(orderId: number): Promise<PartnerChatCacheEntry> {
  if (!Number.isFinite(orderId)) {
    return EMPTY_ENTRY;
  }

  const cached = cache.get(orderId);
  if (cached) return cached;

  const pending = inflight.get(orderId);
  if (pending) return pending;

  const request = fetch(`/api/orders/${orderId}/partner-chat`, {
    credentials: "include",
  })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as {
        messages?: PartnerChatCacheMessage[];
        chatClosed?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || "Failed to load chat");
      }
      const entry: PartnerChatCacheEntry = {
        messages: Array.isArray(body.messages) ? body.messages : [],
        chatClosed: Boolean(body.chatClosed),
      };
      cache.set(orderId, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(orderId);
    });

  inflight.set(orderId, request);
  return request;
}
