import { z } from "zod";
export declare const RoleSchema: z.ZodEnum<{
    rider: "rider";
    customer: "customer";
    merchant: "merchant";
    admin: "admin";
    support: "support";
}>;
export type Role = z.infer<typeof RoleSchema>;
export declare const RiderApprovalStatusSchema: z.ZodEnum<{
    SUSPENDED: "SUSPENDED";
    APPROVED: "APPROVED";
    DRAFT: "DRAFT";
    PENDING_APPROVAL: "PENDING_APPROVAL";
    REJECTED: "REJECTED";
}>;
export type RiderApprovalStatus = z.infer<typeof RiderApprovalStatusSchema>;
export declare const DutyStatusSchema: z.ZodEnum<{
    ON: "ON";
    OFF: "OFF";
}>;
export type DutyStatus = z.infer<typeof DutyStatusSchema>;
export declare const OrderStatusSchema: z.ZodEnum<{
    CANCELLED: "CANCELLED";
    REJECTED: "REJECTED";
    ASSIGNED: "ASSIGNED";
    ACCEPTED: "ACCEPTED";
    ARRIVED_PICKUP: "ARRIVED_PICKUP";
    PICKED_UP: "PICKED_UP";
    ARRIVED_DROP: "ARRIVED_DROP";
    DELIVERED: "DELIVERED";
}>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export declare const OrderCategorySchema: z.ZodEnum<{
    FOOD: "FOOD";
    PARCEL: "PARCEL";
    RIDE: "RIDE";
}>;
export type OrderCategory = z.infer<typeof OrderCategorySchema>;
export declare const KycDocTypeSchema: z.ZodEnum<{
    AADHAAR: "AADHAAR";
    PAN: "PAN";
    DL: "DL";
    RC: "RC";
    BANK: "BANK";
}>;
export type KycDocType = z.infer<typeof KycDocTypeSchema>;
export declare const KycStatusSchema: z.ZodEnum<{
    PENDING: "PENDING";
    REJECTED: "REJECTED";
    NOT_SUBMITTED: "NOT_SUBMITTED";
    VERIFIED: "VERIFIED";
}>;
export type KycStatus = z.infer<typeof KycStatusSchema>;
export declare const OtpRequestSchema: z.ZodObject<{
    phoneE164: z.ZodString;
}, z.core.$strip>;
export type OtpRequest = z.infer<typeof OtpRequestSchema>;
export declare const OtpRequestResponseSchema: z.ZodObject<{
    requestId: z.ZodString;
    expiresInSec: z.ZodNumber;
    smsSent: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;
export declare const OtpVerifySchema: z.ZodObject<{
    requestId: z.ZodString;
    phoneE164: z.ZodString;
    otp: z.ZodString;
    deviceId: z.ZodString;
    appType: z.ZodOptional<z.ZodEnum<{
        rider: "rider";
        customer: "customer";
        merchant: "merchant";
    }>>;
}, z.core.$strip>;
export type OtpVerify = z.infer<typeof OtpVerifySchema>;
/**
 * Dev-only flow:
 * - Rider app signs in with Firebase Phone Auth
 * - App sends Firebase ID token to backend
 * - Backend verifies token and returns a Supabase-compatible session JWT
 *
 * This keeps your "session issuance" logic centralized and unchanged when you later
 * switch OTP providers (e.g. MSG91).
 */
export declare const FirebaseSessionExchangeSchema: z.ZodObject<{
    idToken: z.ZodString;
    deviceId: z.ZodString;
}, z.core.$strip>;
export type FirebaseSessionExchange = z.infer<typeof FirebaseSessionExchangeSchema>;
export declare const SessionSchema: z.ZodObject<{
    accessToken: z.ZodString;
    expiresAt: z.ZodNumber;
    role: z.ZodEnum<{
        rider: "rider";
        customer: "customer";
        merchant: "merchant";
        admin: "admin";
        support: "support";
    }>;
    userId: z.ZodString;
    riderId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Session = z.infer<typeof SessionSchema>;
export declare const RiderProfileSchema: z.ZodObject<{
    riderId: z.ZodString;
    riderDisplayId: z.ZodString;
    userId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    mobile: z.ZodString;
    city: z.ZodNullable<z.ZodString>;
    state: z.ZodNullable<z.ZodString>;
    pincode: z.ZodNullable<z.ZodString>;
    address: z.ZodNullable<z.ZodString>;
    preferredLanguage: z.ZodString;
    referralCode: z.ZodNullable<z.ZodString>;
    referredByDisplayId: z.ZodNullable<z.ZodString>;
    selfieUrl: z.ZodNullable<z.ZodString>;
    approvalStatus: z.ZodEnum<{
        SUSPENDED: "SUSPENDED";
        APPROVED: "APPROVED";
        DRAFT: "DRAFT";
        PENDING_APPROVAL: "PENDING_APPROVAL";
        REJECTED: "REJECTED";
    }>;
    accountStatus: z.ZodString;
    onboardingStatus: z.ZodString;
}, z.core.$strip>;
export type RiderProfile = z.infer<typeof RiderProfileSchema>;
export declare const RiderLocationPingSchema: z.ZodObject<{
    tsMs: z.ZodNumber;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    accuracyM: z.ZodOptional<z.ZodNumber>;
    altitudeM: z.ZodOptional<z.ZodNumber>;
    speedMps: z.ZodOptional<z.ZodNumber>;
    headingDeg: z.ZodOptional<z.ZodNumber>;
    mocked: z.ZodOptional<z.ZodBoolean>;
    provider: z.ZodOptional<z.ZodEnum<{
        unknown: "unknown";
        gps: "gps";
        network: "network";
        fused: "fused";
    }>>;
    deviceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RiderLocationPing = z.infer<typeof RiderLocationPingSchema>;
export declare const FraudSignalSchema: z.ZodEnum<{
    MOCK_LOCATION: "MOCK_LOCATION";
    GPS_DISABLED: "GPS_DISABLED";
    LOW_ACCURACY: "LOW_ACCURACY";
    TELEPORT: "TELEPORT";
    UNREALISTIC_SPEED: "UNREALISTIC_SPEED";
    HEADING_MISMATCH: "HEADING_MISMATCH";
    DEVICE_ID_MISMATCH: "DEVICE_ID_MISMATCH";
}>;
export type FraudSignal = z.infer<typeof FraudSignalSchema>;
export declare const RiderLocationPingResponseSchema: z.ZodObject<{
    accepted: z.ZodBoolean;
    serverTsMs: z.ZodNumber;
    fraudSignals: z.ZodArray<z.ZodEnum<{
        MOCK_LOCATION: "MOCK_LOCATION";
        GPS_DISABLED: "GPS_DISABLED";
        LOW_ACCURACY: "LOW_ACCURACY";
        TELEPORT: "TELEPORT";
        UNREALISTIC_SPEED: "UNREALISTIC_SPEED";
        HEADING_MISMATCH: "HEADING_MISMATCH";
        DEVICE_ID_MISMATCH: "DEVICE_ID_MISMATCH";
    }>>;
    fraudScore: z.ZodNumber;
    eventPersisted: z.ZodOptional<z.ZodBoolean>;
    recommendedPingIntervalMs: z.ZodOptional<z.ZodNumber>;
    trackingMode: z.ZodOptional<z.ZodEnum<{
        idle: "idle";
        moving: "moving";
        active_order: "active_order";
        high_speed: "high_speed";
    }>>;
}, z.core.$strip>;
export type RiderLocationPingResponse = z.infer<typeof RiderLocationPingResponseSchema>;
export declare const LatLngSchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
}, z.core.$strip>;
export type LatLng = z.infer<typeof LatLngSchema>;
export declare const OrderStopSchema: z.ZodObject<{
    stopId: z.ZodString;
    type: z.ZodEnum<{
        PICKUP: "PICKUP";
        DROP: "DROP";
    }>;
    addressText: z.ZodString;
    location: z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type OrderStop = z.infer<typeof OrderStopSchema>;
export declare const OrderSummarySchema: z.ZodObject<{
    orderId: z.ZodString;
    category: z.ZodEnum<{
        FOOD: "FOOD";
        PARCEL: "PARCEL";
        RIDE: "RIDE";
    }>;
    status: z.ZodEnum<{
        CANCELLED: "CANCELLED";
        REJECTED: "REJECTED";
        ASSIGNED: "ASSIGNED";
        ACCEPTED: "ACCEPTED";
        ARRIVED_PICKUP: "ARRIVED_PICKUP";
        PICKED_UP: "PICKED_UP";
        ARRIVED_DROP: "ARRIVED_DROP";
        DELIVERED: "DELIVERED";
    }>;
    stops: z.ZodArray<z.ZodObject<{
        stopId: z.ZodString;
        type: z.ZodEnum<{
            PICKUP: "PICKUP";
            DROP: "DROP";
        }>;
        addressText: z.ZodString;
        location: z.ZodObject<{
            lat: z.ZodNumber;
            lng: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export declare const RealtimeEventEnvelopeSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodString;
    ts: z.ZodString;
    data: z.ZodUnknown;
}, z.core.$strip>;
export type RealtimeEventEnvelope = z.infer<typeof RealtimeEventEnvelopeSchema>;
export declare const RiderOrderEventTypeSchema: z.ZodEnum<{
    ORDER_ASSIGNED: "ORDER_ASSIGNED";
    ORDER_UPDATED: "ORDER_UPDATED";
    ORDER_CANCELLED: "ORDER_CANCELLED";
    BATCH_PROPOSED: "BATCH_PROPOSED";
}>;
export type RiderOrderEventType = z.infer<typeof RiderOrderEventTypeSchema>;
export declare const ApiErrorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    requestId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export * from "./wallet.js";
export * from "./pricing.js";
//# sourceMappingURL=index.d.ts.map