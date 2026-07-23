import { z } from "zod";
// =========================
// Shared enums (all apps)
// =========================
export const RoleSchema = z.enum(["rider", "customer", "merchant", "admin", "support"]);
export const RiderApprovalStatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"]);
export const DutyStatusSchema = z.enum(["ON", "OFF"]);
export const OrderStatusSchema = z.enum([
    "ASSIGNED",
    "ACCEPTED",
    "REJECTED",
    "ARRIVED_PICKUP",
    "PICKED_UP",
    "ARRIVED_DROP",
    "DELIVERED",
    "CANCELLED",
]);
export const OrderCategorySchema = z.enum(["FOOD", "PARCEL", "RIDE"]);
export const KycDocTypeSchema = z.enum(["AADHAAR", "PAN", "DL", "RC", "BANK"]);
export const KycStatusSchema = z.enum(["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED"]);
// =========================
// Auth (Rider)
// =========================
export const OtpRequestSchema = z.object({
    phoneE164: z.string().min(10),
    /** Which app is requesting — lets the backend gate merchant existence checks. */
    appType: z.enum(["customer", "rider", "merchant"]).optional(),
});
export const OtpRequestResponseSchema = z.object({
    requestId: z.string(),
    expiresInSec: z.number().int().positive(),
    /** Whether MSG91 accepted the SMS send (OTP is never returned to clients). */
    smsSent: z.boolean().optional(),
    /**
     * When true, the client must deliver the OTP itself via Supabase
     * signInWithOtp instead of relying on a backend-sent SMS. Used for registered
     * merchant numbers: the existence check + review bypass run on the backend,
     * but real delivery goes through Supabase (the backend MSG91 OTP channels ack
     * but do not deliver on this account). requestId is empty in this case.
     */
    useSupabase: z.boolean().optional(),
});
export const OtpVerifySchema = z.object({
    requestId: z.string(),
    phoneE164: z.string().min(10),
    otp: z.string().min(4).max(8),
    deviceId: z.string().min(6),
    appType: z.enum(["customer", "rider", "merchant"]).optional(),
});
/**
 * Dev-only flow:
 * - Rider app signs in with Firebase Phone Auth
 * - App sends Firebase ID token to backend
 * - Backend verifies token and returns a Supabase-compatible session JWT
 *
 * This keeps your "session issuance" logic centralized and unchanged when you later
 * switch OTP providers (e.g. MSG91).
 */
export const FirebaseSessionExchangeSchema = z.object({
    idToken: z.string().min(10),
    deviceId: z.string().min(6),
});
export const SessionSchema = z.object({
    accessToken: z.string(),
    expiresAt: z.number().int().positive(), // unix seconds
    role: RoleSchema,
    userId: z.string(),
    riderId: z.string().optional(), // rider ID for rider role
});
// =========================
// Rider profile
// =========================
export const RiderProfileSchema = z.object({
    riderId: z.string(),
    riderDisplayId: z.string(),
    userId: z.string(),
    name: z.string().nullable(),
    mobile: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    address: z.string().nullable(),
    preferredLanguage: z.string(),
    referralCode: z.string().nullable(),
    referredByDisplayId: z.string().nullable(),
    selfieUrl: z.string().nullable(),
    approvalStatus: RiderApprovalStatusSchema,
    accountStatus: z.string(),
    onboardingStatus: z.string(),
});
// =========================
// Location (Rider)
// =========================
export const RiderLocationPingSchema = z.object({
    // client timestamp in ms since epoch
    tsMs: z.number().int().positive(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().optional(),
    altitudeM: z.number().optional(),
    speedMps: z.number().nonnegative().optional(),
    headingDeg: z.number().min(0).max(360).optional(),
    mocked: z.boolean().optional(), // Android can detect mock locations
    provider: z.enum(["gps", "network", "fused", "unknown"]).optional(),
    deviceId: z.string().min(6).optional(),
});
export const FraudSignalSchema = z.enum([
    "MOCK_LOCATION",
    "GPS_DISABLED",
    "LOW_ACCURACY",
    "TELEPORT",
    "UNREALISTIC_SPEED",
    "HEADING_MISMATCH",
    "DEVICE_ID_MISMATCH",
]);
export const RiderLocationPingResponseSchema = z.object({
    accepted: z.boolean(),
    serverTsMs: z.number().int().positive(),
    fraudSignals: z.array(FraudSignalSchema),
    fraudScore: z.number().min(0).max(100),
    eventPersisted: z.boolean().optional(),
    recommendedPingIntervalMs: z.number().int().positive().optional(),
    trackingMode: z.enum(["idle", "moving", "active_order", "high_speed"]).optional(),
});
// =========================
// Orders (normalized; source-agnostic)
// =========================
export const LatLngSchema = z.object({
    lat: z.number(),
    lng: z.number(),
});
export const OrderStopSchema = z.object({
    stopId: z.string(),
    type: z.enum(["PICKUP", "DROP"]),
    addressText: z.string().min(1),
    location: LatLngSchema,
});
export const OrderSummarySchema = z.object({
    orderId: z.string(),
    category: OrderCategorySchema,
    status: OrderStatusSchema,
    stops: z.array(OrderStopSchema).min(2),
    createdAt: z.string(), // ISO
});
// =========================
// Realtime events (Supabase Realtime / PubSub)
// =========================
export const RealtimeEventEnvelopeSchema = z.object({
    v: z.literal(1),
    type: z.string(),
    ts: z.string(), // ISO
    data: z.unknown(),
});
export const RiderOrderEventTypeSchema = z.enum([
    "ORDER_ASSIGNED",
    "ORDER_UPDATED",
    "ORDER_CANCELLED",
    "BATCH_PROPOSED",
]);
// =========================
// Standard API error shape
// =========================
export const ApiErrorResponseSchema = z.object({
    error: z.string(),
    message: z.string().optional(),
    requestId: z.string().optional(),
});
// =========================
// Merchant Wallet Engine
// =========================
// Explicit `.js` so the compiled ESM output passes Node's strict resolver
// (Node ESM requires file extensions; tsc with moduleResolution: Bundler
// tolerates the `.js` even though the source is `.ts`).
export * from "./wallet.js";
export * from "./pricing.js";
export * from "./push.js";
//# sourceMappingURL=index.js.map