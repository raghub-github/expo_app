/**
 * Zod schemas for every domain event. Producers `parse()` before writing to
 * the outbox; consumers `parse()` after reading from Kafka. Type drift becomes
 * impossible because the schema is the contract.
 *
 * Conventions:
 *   - Money values are integers in PAISE (no floats — see existing pricing util)
 *   - Timestamps are ISO 8601 strings (transport-friendly, easy to inspect)
 *   - IDs follow existing patterns: orderIdText "GM10000042", numeric storeId
 *   - All schemas carry { eventId, occurredAt } for idempotency + audit
 *
 * Adding a new event:
 *   1. Add the schema here
 *   2. Add the topic name in topics.ts
 *   3. Bump the version when you change a non-additive field
 */
import { z } from "zod";
/* ─────────── Common envelope ─────────── */
const envelope = z.object({
    /** ULID — used by consumers to dedup re-delivered events. */
    eventId: z.string().min(8),
    /** When the domain change happened (NOT when the message was published). */
    occurredAt: z.string().datetime(),
    /** Producer service name; useful for forensics. */
    producer: z.string().min(1).optional(),
});
/* ─────────── Order events ─────────── */
export const orderCreatedV1 = envelope.extend({
    type: z.literal("order.created.v1"),
    orderIdText: z.string().min(1).max(64),
    customerId: z.number().int().positive(),
    merchantStoreId: z.number().int().positive(),
    /** Final amount in paise (after discount, tax, tip — what the customer paid). */
    finalAmountPaise: z.number().int().nonnegative(),
    itemCount: z.number().int().positive(),
});
export const orderAcceptedV1 = envelope.extend({
    type: z.literal("order.accepted.v1"),
    orderIdText: z.string(),
    merchantStoreId: z.number().int().positive(),
    acceptedByMerchantUserId: z.number().int().positive().optional(),
});
export const orderCancelledV1 = envelope.extend({
    type: z.literal("order.cancelled.v1"),
    orderIdText: z.string(),
    reason: z.enum([
        "MERCHANT_DECLINED",
        "CUSTOMER_CANCELLED",
        "ACCEPTANCE_TIMEOUT",
        "RIDER_UNAVAILABLE",
        "PAYMENT_FAILED",
        "OTHER",
    ]),
    refundExpectedPaise: z.number().int().nonnegative().optional(),
});
export const orderDeliveredV1 = envelope.extend({
    type: z.literal("order.delivered.v1"),
    orderIdText: z.string(),
    riderId: z.number().int().positive().optional(),
    deliveredAt: z.string().datetime(),
    promisedAt: z.string().datetime().nullable(),
});
/* ─────────── Payment events ─────────── */
export const paymentSuccessV1 = envelope.extend({
    type: z.literal("payment.success.v1"),
    orderIdText: z.string(),
    paymentGateway: z.enum(["razorpay", "stripe", "dummy"]),
    paymentId: z.string().min(1),
    amountPaise: z.number().int().nonnegative(),
});
export const paymentFailedV1 = envelope.extend({
    type: z.literal("payment.failed.v1"),
    orderIdText: z.string().optional(),
    paymentGateway: z.enum(["razorpay", "stripe", "dummy"]),
    paymentId: z.string().optional(),
    errorCode: z.string().optional(),
    errorDescription: z.string().optional(),
});
/* ─────────── Rider events ─────────── */
export const riderAssignedV1 = envelope.extend({
    type: z.literal("rider.assigned.v1"),
    orderIdText: z.string(),
    riderId: z.number().int().positive(),
    assignedAt: z.string().datetime(),
});
export const riderLocationUpdatedV1 = envelope.extend({
    type: z.literal("rider.location.updated.v1"),
    riderId: z.number().int().positive(),
    lat: z.number(),
    lng: z.number(),
    /** Optional — only present when rider is on an active order. */
    orderIdText: z.string().optional(),
});
/* ─────────── Merchant events ─────────── */
export const merchantStatusUpdatedV1 = envelope.extend({
    type: z.literal("merchant.status.updated.v1"),
    merchantStoreId: z.number().int().positive(),
    liveStatus: z.enum(["OPEN", "CLOSED"]),
    reason: z.string().optional(),
});
/* ─────────── Discriminated union for type-safe handlers ─────────── */
export const eventSchema = z.discriminatedUnion("type", [
    orderCreatedV1,
    orderAcceptedV1,
    orderCancelledV1,
    orderDeliveredV1,
    paymentSuccessV1,
    paymentFailedV1,
    riderAssignedV1,
    riderLocationUpdatedV1,
    merchantStatusUpdatedV1,
]);
//# sourceMappingURL=schemas.js.map