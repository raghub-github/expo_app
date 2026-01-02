import { z } from "zod";

// =========================
// Shared enums (all apps)
// =========================

export const RoleSchema = z.enum(["rider", "customer", "merchant", "admin", "support"]);
export type Role = z.infer<typeof RoleSchema>;

export const RiderApprovalStatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"]);
export type RiderApprovalStatus = z.infer<typeof RiderApprovalStatusSchema>;

export const DutyStatusSchema = z.enum(["ON", "OFF"]);
export type DutyStatus = z.infer<typeof DutyStatusSchema>;

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
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderCategorySchema = z.enum(["FOOD", "PARCEL", "RIDE"]);
export type OrderCategory = z.infer<typeof OrderCategorySchema>;

export const KycDocTypeSchema = z.enum(["AADHAAR", "PAN", "DL", "RC", "BANK"]);
export type KycDocType = z.infer<typeof KycDocTypeSchema>;

export const KycStatusSchema = z.enum(["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED"]);
export type KycStatus = z.infer<typeof KycStatusSchema>;

// =========================
// Auth (Rider)
// =========================

export const OtpRequestSchema = z.object({
  phoneE164: z.string().min(10),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpRequestResponseSchema = z.object({
  requestId: z.string(),
  expiresInSec: z.number().int().positive(),
  otp: z.string().optional(), // For development - OTP to display to user
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

export const OtpVerifySchema = z.object({
  requestId: z.string(),
  phoneE164: z.string().min(10),
  otp: z.string().min(4).max(8),
  deviceId: z.string().min(6),
});
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
export const FirebaseSessionExchangeSchema = z.object({
  idToken: z.string().min(10),
  deviceId: z.string().min(6),
});
export type FirebaseSessionExchange = z.infer<typeof FirebaseSessionExchangeSchema>;

export const SessionSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.number().int().positive(), // unix seconds
  role: RoleSchema,
  userId: z.string(),
  riderId: z.string().optional(), // rider ID for rider role
});
export type Session = z.infer<typeof SessionSchema>;

// =========================
// Rider profile
// =========================

export const RiderProfileSchema = z.object({
  riderId: z.string(),
  name: z.string().min(1),
  city: z.string().min(1),
  preferredLanguage: z.string().min(2),
  approvalStatus: RiderApprovalStatusSchema,
});
export type RiderProfile = z.infer<typeof RiderProfileSchema>;

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
export type RiderLocationPing = z.infer<typeof RiderLocationPingSchema>;

export const FraudSignalSchema = z.enum([
  "MOCK_LOCATION",
  "GPS_DISABLED",
  "LOW_ACCURACY",
  "TELEPORT",
  "UNREALISTIC_SPEED",
  "HEADING_MISMATCH",
  "DEVICE_ID_MISMATCH",
]);
export type FraudSignal = z.infer<typeof FraudSignalSchema>;

export const RiderLocationPingResponseSchema = z.object({
  accepted: z.boolean(),
  serverTsMs: z.number().int().positive(),
  fraudSignals: z.array(FraudSignalSchema),
  fraudScore: z.number().min(0).max(100),
});
export type RiderLocationPingResponse = z.infer<typeof RiderLocationPingResponseSchema>;

// =========================
// Orders (normalized; source-agnostic)
// =========================

export const LatLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type LatLng = z.infer<typeof LatLngSchema>;

export const OrderStopSchema = z.object({
  stopId: z.string(),
  type: z.enum(["PICKUP", "DROP"]),
  addressText: z.string().min(1),
  location: LatLngSchema,
});
export type OrderStop = z.infer<typeof OrderStopSchema>;

export const OrderSummarySchema = z.object({
  orderId: z.string(),
  category: OrderCategorySchema,
  status: OrderStatusSchema,
  stops: z.array(OrderStopSchema).min(2),
  createdAt: z.string(), // ISO
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

// =========================
// Realtime events (Supabase Realtime / PubSub)
// =========================

export const RealtimeEventEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.string(),
  ts: z.string(), // ISO
  data: z.unknown(),
});
export type RealtimeEventEnvelope = z.infer<typeof RealtimeEventEnvelopeSchema>;

export const RiderOrderEventTypeSchema = z.enum([
  "ORDER_ASSIGNED",
  "ORDER_UPDATED",
  "ORDER_CANCELLED",
  "BATCH_PROPOSED",
]);
export type RiderOrderEventType = z.infer<typeof RiderOrderEventTypeSchema>;

// =========================
// Standard API error shape
// =========================

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  requestId: z.string().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;


