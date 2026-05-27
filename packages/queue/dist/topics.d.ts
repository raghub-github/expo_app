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
export declare const QUEUE_NAMES: {
    readonly PUSH_SEND: "q.push.send";
    readonly PAYMENT_RECONCILE: "q.payment.reconcile";
    readonly PAYMENT_WEBHOOK_RETRY: "q.payment.webhook-retry";
    readonly ETA_RECALC: "q.eta.recalc";
};
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type PushSendJob = {
    /** Either single token OR an array — worker fans out internally. */
    to: string | string[];
    title: string;
    body: string;
    data?: Record<string, unknown>;
    /** Optional deep-link target for tap. */
    screen?: string;
    /** Optional image attachment URL. */
    imageUrl?: string;
    /** Sound, badge, channel etc. */
    sound?: "default" | string;
    channelId?: string;
};
export type PaymentReconcileJob = {
    /** Set to true on the scheduled tick; false when triggered ad-hoc. */
    scheduled: boolean;
};
export type PaymentWebhookRetryJob = {
    /** Original webhook payload that failed processing. */
    payload: Record<string, unknown>;
    /** Razorpay event ID (used for idempotent storage). */
    eventId: string;
    /** Why the previous attempt failed — surfaced in DLQ. */
    reason: string;
};
export type EtaRecalcJob = {
    orderIdText: string;
    reason: "RIDER_ASSIGNED" | "RIDER_PICKED_UP" | "TRAFFIC_UPDATE" | "WEATHER_UPDATE" | "MERCHANT_DELAY" | "STATUS_CHANGE";
};
export type JobShape = {
    [QUEUE_NAMES.PUSH_SEND]: PushSendJob;
    [QUEUE_NAMES.PAYMENT_RECONCILE]: PaymentReconcileJob;
    [QUEUE_NAMES.PAYMENT_WEBHOOK_RETRY]: PaymentWebhookRetryJob;
    [QUEUE_NAMES.ETA_RECALC]: EtaRecalcJob;
};
//# sourceMappingURL=topics.d.ts.map