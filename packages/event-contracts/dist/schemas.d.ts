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
export declare const orderCreatedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.created.v1">;
    orderIdText: z.ZodString;
    customerId: z.ZodNumber;
    merchantStoreId: z.ZodNumber;
    finalAmountPaise: z.ZodNumber;
    itemCount: z.ZodNumber;
}, z.core.$strip>;
export declare const orderAcceptedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.accepted.v1">;
    orderIdText: z.ZodString;
    merchantStoreId: z.ZodNumber;
    acceptedByMerchantUserId: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const orderCancelledV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.cancelled.v1">;
    orderIdText: z.ZodString;
    reason: z.ZodEnum<{
        PAYMENT_FAILED: "PAYMENT_FAILED";
        MERCHANT_DECLINED: "MERCHANT_DECLINED";
        CUSTOMER_CANCELLED: "CUSTOMER_CANCELLED";
        ACCEPTANCE_TIMEOUT: "ACCEPTANCE_TIMEOUT";
        RIDER_UNAVAILABLE: "RIDER_UNAVAILABLE";
        OTHER: "OTHER";
    }>;
    refundExpectedPaise: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const orderDeliveredV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.delivered.v1">;
    orderIdText: z.ZodString;
    riderId: z.ZodOptional<z.ZodNumber>;
    deliveredAt: z.ZodString;
    promisedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const paymentSuccessV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"payment.success.v1">;
    orderIdText: z.ZodString;
    paymentGateway: z.ZodEnum<{
        razorpay: "razorpay";
        stripe: "stripe";
        dummy: "dummy";
    }>;
    paymentId: z.ZodString;
    amountPaise: z.ZodNumber;
}, z.core.$strip>;
export declare const paymentFailedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"payment.failed.v1">;
    orderIdText: z.ZodOptional<z.ZodString>;
    paymentGateway: z.ZodEnum<{
        razorpay: "razorpay";
        stripe: "stripe";
        dummy: "dummy";
    }>;
    paymentId: z.ZodOptional<z.ZodString>;
    errorCode: z.ZodOptional<z.ZodString>;
    errorDescription: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const riderAssignedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rider.assigned.v1">;
    orderIdText: z.ZodString;
    riderId: z.ZodNumber;
    assignedAt: z.ZodString;
}, z.core.$strip>;
export declare const riderLocationUpdatedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rider.location.updated.v1">;
    riderId: z.ZodNumber;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    orderIdText: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const merchantStatusUpdatedV1: z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"merchant.status.updated.v1">;
    merchantStoreId: z.ZodNumber;
    liveStatus: z.ZodEnum<{
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const eventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.created.v1">;
    orderIdText: z.ZodString;
    customerId: z.ZodNumber;
    merchantStoreId: z.ZodNumber;
    finalAmountPaise: z.ZodNumber;
    itemCount: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.accepted.v1">;
    orderIdText: z.ZodString;
    merchantStoreId: z.ZodNumber;
    acceptedByMerchantUserId: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.cancelled.v1">;
    orderIdText: z.ZodString;
    reason: z.ZodEnum<{
        PAYMENT_FAILED: "PAYMENT_FAILED";
        MERCHANT_DECLINED: "MERCHANT_DECLINED";
        CUSTOMER_CANCELLED: "CUSTOMER_CANCELLED";
        ACCEPTANCE_TIMEOUT: "ACCEPTANCE_TIMEOUT";
        RIDER_UNAVAILABLE: "RIDER_UNAVAILABLE";
        OTHER: "OTHER";
    }>;
    refundExpectedPaise: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"order.delivered.v1">;
    orderIdText: z.ZodString;
    riderId: z.ZodOptional<z.ZodNumber>;
    deliveredAt: z.ZodString;
    promisedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"payment.success.v1">;
    orderIdText: z.ZodString;
    paymentGateway: z.ZodEnum<{
        razorpay: "razorpay";
        stripe: "stripe";
        dummy: "dummy";
    }>;
    paymentId: z.ZodString;
    amountPaise: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"payment.failed.v1">;
    orderIdText: z.ZodOptional<z.ZodString>;
    paymentGateway: z.ZodEnum<{
        razorpay: "razorpay";
        stripe: "stripe";
        dummy: "dummy";
    }>;
    paymentId: z.ZodOptional<z.ZodString>;
    errorCode: z.ZodOptional<z.ZodString>;
    errorDescription: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rider.assigned.v1">;
    orderIdText: z.ZodString;
    riderId: z.ZodNumber;
    assignedAt: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rider.location.updated.v1">;
    riderId: z.ZodNumber;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    orderIdText: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    eventId: z.ZodString;
    occurredAt: z.ZodString;
    producer: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"merchant.status.updated.v1">;
    merchantStoreId: z.ZodNumber;
    liveStatus: z.ZodEnum<{
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "type">;
export type DomainEvent = z.infer<typeof eventSchema>;
export type OrderCreatedV1 = z.infer<typeof orderCreatedV1>;
export type OrderAcceptedV1 = z.infer<typeof orderAcceptedV1>;
export type OrderCancelledV1 = z.infer<typeof orderCancelledV1>;
export type OrderDeliveredV1 = z.infer<typeof orderDeliveredV1>;
export type PaymentSuccessV1 = z.infer<typeof paymentSuccessV1>;
export type PaymentFailedV1 = z.infer<typeof paymentFailedV1>;
export type RiderAssignedV1 = z.infer<typeof riderAssignedV1>;
export type RiderLocationUpdatedV1 = z.infer<typeof riderLocationUpdatedV1>;
export type MerchantStatusUpdatedV1 = z.infer<typeof merchantStatusUpdatedV1>;
//# sourceMappingURL=schemas.d.ts.map