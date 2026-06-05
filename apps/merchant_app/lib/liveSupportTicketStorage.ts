import * as SecureStore from "expo-secure-store";

export type StoredLiveSupportTicket = {
  ticketId: number;
  ticketDisplayId: string;
  orderCoreId: number | null;
  formattedOrderId: string | null;
  subject: string | null;
  status: string;
  /** ISO timestamp — agent messages after this are counted unread. */
  lastReadAt?: string | null;
};

const KEY_PREFIX = "merchant_live_support_ticket_v1_";
const FAB_POS_PREFIX = "merchant_live_support_fab_pos_v1_";

export type LiveSupportFabPosition = { x: number; y: number };

function storageKey(storeId: number): string {
  return `${KEY_PREFIX}${storeId}`;
}

export async function loadStoredLiveSupportTicket(
  storeId: number
): Promise<StoredLiveSupportTicket | null> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLiveSupportTicket;
    if (!Number.isInteger(parsed.ticketId) || parsed.ticketId < 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveStoredLiveSupportTicket(
  storeId: number,
  ticket: StoredLiveSupportTicket
): Promise<void> {
  try {
    await SecureStore.setItemAsync(storageKey(storeId), JSON.stringify(ticket));
  } catch {
    // Non-fatal — in-memory state still works for this session.
  }
}

export async function clearStoredLiveSupportTicket(storeId: number): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storageKey(storeId));
  } catch {
    // ignore
  }
}

export function isLiveSupportTicketTerminal(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toUpperCase();
  return s === "RESOLVED" || s === "CLOSED";
}

function fabPosKey(storeId: number): string {
  return `${FAB_POS_PREFIX}${storeId}`;
}

export async function loadLiveSupportFabPosition(
  storeId: number
): Promise<LiveSupportFabPosition | null> {
  try {
    const raw = await SecureStore.getItemAsync(fabPosKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveSupportFabPosition;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLiveSupportFabPosition(
  storeId: number,
  pos: LiveSupportFabPosition
): Promise<void> {
  try {
    await SecureStore.setItemAsync(fabPosKey(storeId), JSON.stringify(pos));
  } catch {
    // ignore
  }
}
