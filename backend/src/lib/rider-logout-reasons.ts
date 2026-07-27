import { z } from "zod";

export const RIDER_LOGOUT_REASON_CODES = [
  "HAPPY",
  "PAYMENT_UNDERSTANDING",
  "NO_ORDERS_AREA",
  "PHONE_TECH",
  "PAYMENT_DELAY",
  "TEAM_LEADER_NO_RESPONSE",
  "PENALTY_ISSUES",
  "OTHER",
] as const;

export type RiderLogoutReasonCode = (typeof RIDER_LOGOUT_REASON_CODES)[number];

export const RiderLogoutBodySchema = z.object({
  reasonCode: z.enum(RIDER_LOGOUT_REASON_CODES),
  reasonText: z.string().trim().max(500).optional(),
  /** When true, revoke every active device session for this rider. */
  logoutAllDevices: z.boolean().optional(),
});
