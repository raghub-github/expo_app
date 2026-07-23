/**
 * Helper for any backend module that needs to send a push notification AS A
 * SIDE EFFECT of a request (order placed, rider assigned, status changed).
 *
 * Why this exists separately from the admin `/v1/push/send-notification`:
 *   - That endpoint returns delivery counts synchronously (UI shows
 *     accepted/failed/batches). Migrating it to async would break the UI
 *     contract.
 *   - Side-effect pushes have no caller waiting for counts. They MUST NOT
 *     block the response. This helper enqueues and returns immediately.
 *
 * Usage:
 *   import { enqueuePush } from "@/modules/push/enqueuePush";
 *
 *   await enqueuePush({
 *     to: customerToken,
 *     title: "Order placed",
 *     body: "Your order #GM10000042 is being prepared",
 *     data: { orderId: "GM10000042" },
 *     screen: "/orders/[id]",
 *   });
 *
 * Failures are swallowed + logged. Push delivery is best-effort by design;
 * a Redis outage must never roll back an order placement.
 */
import type { PushSendJob } from "@gatimitra/queue";
import { deliverExpoPush } from "./deliverExpoPush.js";

/**
 * Side-effect push helper. Defaults to inline Expo delivery so order events
 * still reach devices when Redis/worker is down. Set PUSH_USE_QUEUE=1 to
 * prefer BullMQ (with automatic inline fallback).
 */
export async function enqueuePush(payload: PushSendJob): Promise<{ ok: boolean; error?: string }> {
  const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
  if (tokens.length === 0) return { ok: false, error: "no_tokens" };
  const result = await deliverExpoPush(payload);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "push_failed" };
}
