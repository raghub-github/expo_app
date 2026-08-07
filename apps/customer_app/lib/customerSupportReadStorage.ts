import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TicketListItem } from "@/services/customerSupport.service";

const KEY_PREFIX = "customer_support_ticket_read_v1";

function storageKey(customerSub: string | null | undefined): string {
  const sub = String(customerSub ?? "").trim() || "anonymous";
  return `${KEY_PREFIX}:${sub}`;
}

export type CustomerSupportReadMap = Record<string, string>;

export function mergeReadAtMaps(
  a: CustomerSupportReadMap,
  b: CustomerSupportReadMap
): CustomerSupportReadMap {
  const out: CustomerSupportReadMap = { ...a };
  for (const [id, iso] of Object.entries(b)) {
    const prev = out[id];
    if (!prev) {
      out[id] = iso;
      continue;
    }
    const prevMs = new Date(prev).getTime();
    const nextMs = new Date(iso).getTime();
    if (Number.isFinite(nextMs) && (!Number.isFinite(prevMs) || nextMs > prevMs)) {
      out[id] = iso;
    }
  }
  return out;
}

export async function loadCustomerSupportReadMap(
  customerSub: string | null | undefined
): Promise<CustomerSupportReadMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(customerSub));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CustomerSupportReadMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveCustomerSupportReadMap(
  customerSub: string | null | undefined,
  map: CustomerSupportReadMap
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(customerSub), JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

export async function saveCustomerSupportReadAt(
  customerSub: string | null | undefined,
  ticketId: number,
  readAtIso: string
): Promise<CustomerSupportReadMap> {
  const map = await loadCustomerSupportReadMap(customerSub);
  const key = String(ticketId);
  const prev = map[key];
  if (prev && new Date(prev).getTime() >= new Date(readAtIso).getTime()) {
    return map;
  }
  const next = { ...map, [key]: readAtIso };
  await saveCustomerSupportReadMap(customerSub, next);
  return next;
}

export function latestSupportMessageTimestamp(
  messages: Array<{ created_at: string; sender_type?: string | null }>,
  fallback?: string | null
): string {
  let maxMs = 0;
  for (const m of messages) {
    const ts = new Date(m.created_at).getTime();
    if (Number.isFinite(ts) && ts > maxMs) maxMs = ts;
  }
  if (maxMs > 0) return new Date(maxMs).toISOString();
  if (fallback) {
    const fb = new Date(fallback).getTime();
    if (Number.isFinite(fb)) return new Date(fb).toISOString();
  }
  return new Date().toISOString();
}

/** When the customer opens the chat, mark through now + ticket bumps (status/resolve). */
export function computeTicketReadWatermark(
  messages: Array<{ created_at: string }>,
  ticketUpdatedAt?: string | null,
  listLastResponseAt?: string | null
): string {
  const candidates = [
    latestSupportMessageTimestamp(messages, ticketUpdatedAt ?? null),
    ticketUpdatedAt,
    listLastResponseAt,
    new Date().toISOString(),
  ];
  let maxMs = 0;
  for (const iso of candidates) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
  }
  return new Date(maxMs).toISOString();
}

function isSupportSideResponse(type: string | null | undefined): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "AGENT" || t === "SYSTEM";
}

/** Unread agent/system replies since the customer last opened the ticket chat. */
export function ticketListUnreadCount(
  item: TicketListItem,
  lastReadAt: string | null | undefined
): number {
  if (!isSupportSideResponse(item.last_response_by_type)) {
    return 0;
  }
  const lastAt = item.last_response_at;
  if (!lastAt) return 0;
  if (!lastReadAt) return 1;

  const lastMs = new Date(lastAt).getTime();
  const readMs = new Date(lastReadAt).getTime();
  if (!Number.isFinite(lastMs)) return 0;
  if (!Number.isFinite(readMs)) return 1;
  // Small tolerance for clock / ISO formatting skew between list row and local read stamp.
  return lastMs > readMs + 500 ? 1 : 0;
}

export function ticketListNeedsAttention(
  item: TicketListItem,
  lastReadAt: string | null | undefined
): boolean {
  const unread = ticketListUnreadCount(item, lastReadAt);
  if (unread > 0) return true;
  return String(item.status).toUpperCase().replace(/-/g, "_") === "WAITING_FOR_USER";
}
