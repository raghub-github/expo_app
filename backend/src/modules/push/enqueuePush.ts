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
import { enqueue, QUEUE_NAMES, type PushSendJob } from "@gatimitra/queue";
import { incrCounter } from "@gatimitra/logger";

export async function enqueuePush(payload: PushSendJob): Promise<void> {
  try {
    const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
    if (tokens.length === 0) return;
    // jobId stays optional — push isn't idempotent (multiple "order placed"
    // pushes from retries on the producer side would dedup at the consumer
    // via Expo's ticket layer, not here).
    await enqueue(QUEUE_NAMES.PUSH_SEND, payload);
    incrCounter("push_enqueued_total", "Push notifications enqueued", tokens.length);
  } catch (err) {
    // Tolerated: log + move on. The order/status that triggered the push
    // is already committed to Postgres.
    incrCounter("push_enqueue_failed_total", "Push enqueue failures (tolerated)");
    console.warn("[push] enqueue failed (tolerated)", (err as Error).message);
  }
}
