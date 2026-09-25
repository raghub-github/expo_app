import { getItem, setItem } from "@/src/utils/storage";

const ACK_KEY = "rider_event_ack_v1";
const SELF_CANCEL_KEY = "rider_self_cancel_v1";
const MAX_IDS = 200;

const sessionAck = new Set<string>();
const sessionSelfCancel = new Set<string>();

function norm(id: string): string {
  return id.trim().toLowerCase();
}

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => norm(String(v))).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeList(key: string, ids: string[]): Promise<void> {
  await setItem(key, JSON.stringify([...new Set(ids)].slice(-MAX_IDS)));
}

export function cancellationEventId(orderKey: string, actor: string | null | undefined): string {
  return `cancel:${norm(orderKey)}:${norm(actor || "unknown")}`;
}

export function rememberRiderSelfCancel(orderKey: string): void {
  const id = norm(orderKey);
  if (!id) return;
  sessionSelfCancel.add(id);
  void readList(SELF_CANCEL_KEY).then((ids) => {
    if (!ids.includes(id)) void writeList(SELF_CANCEL_KEY, [...ids, id]);
  });
}

export async function wasRiderSelfCancel(orderKey: string): Promise<boolean> {
  const id = norm(orderKey);
  if (!id) return false;
  if (sessionSelfCancel.has(id)) return true;
  const ids = await readList(SELF_CANCEL_KEY);
  if (ids.includes(id)) {
    sessionSelfCancel.add(id);
    return true;
  }
  return false;
}

export function acknowledgeRiderEvent(eventId: string): void {
  const id = norm(eventId);
  if (!id) return;
  sessionAck.add(id);
  void readList(ACK_KEY).then((ids) => {
    if (!ids.includes(id)) void writeList(ACK_KEY, [...ids, id]);
  });
}

export async function isRiderEventAcknowledged(eventId: string): Promise<boolean> {
  const id = norm(eventId);
  if (!id) return false;
  if (sessionAck.has(id)) return true;
  const ids = await readList(ACK_KEY);
  if (ids.includes(id)) {
    sessionAck.add(id);
    return true;
  }
  return false;
}
