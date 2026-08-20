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

function isTransientChatFailure(status: number, code: string | undefined): boolean {
  const c = String(code || "").toUpperCase();
  return (
    status === 499 ||
    status === 503 ||
    c === "REQUEST_ABORTED" ||
    c === "SERVICE_UNAVAILABLE"
  );
}

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

  const request = (async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const res = await fetch(`/api/orders/${orderId}/partner-chat`, {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          messages?: PartnerChatCacheMessage[];
          chatClosed?: boolean;
          error?: string;
          code?: string;
        };
        if (isTransientChatFailure(res.status, body.code)) {
          if (attempt < 4) {
            await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** attempt)));
            continue;
          }
          return EMPTY_ENTRY;
        }
        if (!res.ok) {
          return EMPTY_ENTRY;
        }
        const entry: PartnerChatCacheEntry = {
          messages: Array.isArray(body.messages) ? body.messages : [],
          chatClosed: Boolean(body.chatClosed),
        };
        cache.set(orderId, entry);
        return entry;
      } catch {
        if (attempt < 4) {
          await new Promise((r) => setTimeout(r, Math.min(4000, 400 * 2 ** attempt)));
          continue;
        }
        return EMPTY_ENTRY;
      }
    }
    return EMPTY_ENTRY;
  })().finally(() => {
    inflight.delete(orderId);
  });

  inflight.set(orderId, request);
  return request;
}
