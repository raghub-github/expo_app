/**
 * Canonical queue + job-name registry. Keep all in one file so producers and
 * workers can't drift on a string typo. Each queue maps 1:1 to a BullMQ
 * Queue instance — workers subscribe by name.
 *
 * Naming convention: `q.<domain>.<purpose>`.
 *   - `q.push.send`           — send an Expo push notification
 *   - `q.payment.reconcile`   — periodic reconciler for pending razorpay orders
 *   - `q.payment.webhook-retry` — Razorpay webhook delivery retries
 *   - `q.eta.recalc`          — recompute ETA on a status change
 *
 * Each producer call provides a `jobId` for idempotency where it matters.
 */
export const QUEUE_NAMES = {
    PUSH_SEND: "q.push.send",
    PAYMENT_RECONCILE: "q.payment.reconcile",
    PAYMENT_WEBHOOK_RETRY: "q.payment.webhook-retry",
    ETA_RECALC: "q.eta.recalc",
};
//# sourceMappingURL=topics.js.map