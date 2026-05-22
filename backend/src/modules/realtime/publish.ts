/**
 * Realtime publishers — backend → Redis pub/sub → ws-gateway → connected clients.
 *
 * Channel naming convention:
 *   order:GM10000042   — every customer-visible event for one order
 *   rider:42           — rider's own assignment / location updates
 *   store:45           — store-wide events (kitchen busy, schedule flip)
 *
 * Event envelope:
 *   { type: <verb>, at: <ISO>, ...payload }
 *
 * Failures are tolerated — a realtime publish must never roll back the
 * domain transaction that produced it. Worst case: client polls and catches
 * up on next interval.
 */
import { publish } from "@gatimitra/redis";

type RealtimeEvent = Record<string, unknown> & { type: string };

async function safePublish(channel: string, event: RealtimeEvent): Promise<void> {
  try {
    await publish(channel, { ...event, at: new Date().toISOString() });
  } catch (err) {
    console.warn("[realtime] publish failed (tolerated)", channel, (err as Error).message);
  }
}

export async function publishOrderEvent(
  orderIdText: string,
  event: RealtimeEvent,
): Promise<void> {
  if (!orderIdText) return;
  await safePublish(`order:${orderIdText}`, event);
}

export async function publishRiderEvent(
  riderId: number | string,
  event: RealtimeEvent,
): Promise<void> {
  if (riderId == null) return;
  await safePublish(`rider:${riderId}`, event);
}

export async function publishStoreEvent(
  storeId: number | string,
  event: RealtimeEvent,
): Promise<void> {
  if (storeId == null) return;
  await safePublish(`store:${storeId}`, event);
}
