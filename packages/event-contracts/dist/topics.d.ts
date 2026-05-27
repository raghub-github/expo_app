/**
 * Topic registry — every Kafka topic the platform publishes lives here.
 *
 * Naming convention: `{domain}.{action}.{version}`. Bumping the version
 * means a breaking payload change; consumers stay on the old version until
 * they upgrade. Never mutate an existing topic's schema in place.
 *
 * Naming rules:
 *   - lowercase + dots
 *   - past tense for events ("created", "captured", "delivered")
 *   - imperative ONLY for commands (we don't use commands yet — all events)
 */
export declare const TOPICS: {
    readonly ORDER_CREATED: "order.created.v1";
    readonly ORDER_ACCEPTED: "order.accepted.v1";
    readonly ORDER_CANCELLED: "order.cancelled.v1";
    readonly ORDER_DELIVERED: "order.delivered.v1";
    readonly PAYMENT_SUCCESS: "payment.success.v1";
    readonly PAYMENT_FAILED: "payment.failed.v1";
    readonly RIDER_ASSIGNED: "rider.assigned.v1";
    readonly RIDER_LOCATION_UPDATED: "rider.location.updated.v1";
    readonly MERCHANT_STATUS_UPDATED: "merchant.status.updated.v1";
};
export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
//# sourceMappingURL=topics.d.ts.map