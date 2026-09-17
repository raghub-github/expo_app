/**
 * Rider electronic verify rate-limit — REMOVED.
 *
 * Historical SoT was public.rider_electronic_verify_attempts (dropped in 0633).
 * These exports remain as always-allow no-ops so any residual imports cannot
 * block Cashfree Verify Instantly. Do not re-introduce attempt counters here.
 */

export const RIDER_ELECTRONIC_VERIFY_MAX_ATTEMPTS = Number.POSITIVE_INFINITY;
export const RIDER_ELECTRONIC_VERIFY_WINDOW_MS = 0;
export const RIDER_ELECTRONIC_VERIFY_PROVIDER = "cashfree";
export const RIDER_ELECTRONIC_VERIFY_ACTION = "verify_instantly";

export type RiderVerifyDocKind =
  | "pan"
  | "driving_licence"
  | "vehicle_rc"
  | "aadhaar"
  | "bank_account";

export type RiderElectronicVerifyRateLimit = {
  allowed: boolean;
  attemptsUsed: number;
  maxAttempts: number;
  retryAfterSec: number;
  resetsAt: string | null;
  rateLimitedUntil: string | null;
  serverNow: string;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  /** Present only on consume result. */
  consumed?: boolean;
};

export const RIDER_VERIFY_RATE_LIMIT_MESSAGE =
  "Verification rate limiting is disabled.";

export function riderElectronicVerifyRateLimitKey(
  riderId: number,
  docKind: RiderVerifyDocKind,
): string {
  return `ev_verify:${riderId}:${docKind}:${RIDER_ELECTRONIC_VERIFY_PROVIDER}:${RIDER_ELECTRONIC_VERIFY_ACTION}`;
}

export function normalizeRiderVerifyDocKind(raw: string | null | undefined): RiderVerifyDocKind | null {
  const k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (k === "pan" || k === "pan_360") return "pan";
  if (k === "driving_licence" || k === "dl" || k === "driving_license") return "driving_licence";
  if (k === "vehicle_rc" || k === "rc") return "vehicle_rc";
  if (k === "aadhaar" || k === "aadhaar_digilocker") return "aadhaar";
  if (k === "bank_account" || k === "bank") return "bank_account";
  return null;
}

function alwaysAllowed(): RiderElectronicVerifyRateLimit {
  return {
    allowed: true,
    attemptsUsed: 0,
    maxAttempts: RIDER_ELECTRONIC_VERIFY_MAX_ATTEMPTS,
    retryAfterSec: 0,
    resetsAt: null,
    rateLimitedUntil: null,
    serverNow: new Date().toISOString(),
    firstAttemptAt: null,
    lastAttemptAt: null,
  };
}

export function riderVerifyRateLimitPayload(
  limit: RiderElectronicVerifyRateLimit,
  docKind: RiderVerifyDocKind,
) {
  return {
    forceManual: false,
    rateLimited: false,
    allowed: true,
    error: null,
    attemptsUsed: 0,
    maxAttempts: limit.maxAttempts,
    retryAfterSec: 0,
    resetsAt: null,
    rateLimitedUntil: null,
    serverNow: limit.serverNow || new Date().toISOString(),
    firstAttemptAt: null,
    lastAttemptAt: null,
    docKind,
    provider: RIDER_ELECTRONIC_VERIFY_PROVIDER,
    action: RIDER_ELECTRONIC_VERIFY_ACTION,
    rateLimitKey: riderElectronicVerifyRateLimitKey(0, docKind).replace(
      /^ev_verify:0:/,
      "ev_verify:*:",
    ),
  };
}

export function buildRiderElectronicVerifyRateLimitFromAttempts(_args: {
  attemptsUsed: number;
  oldest?: Date | string | null;
  newest?: Date | string | null;
  nowMs?: number;
}): RiderElectronicVerifyRateLimit {
  return alwaysAllowed();
}

/** No-op: rate-limit table dropped. */
export async function purgeExpiredRiderElectronicVerifyAttempts(_args?: {
  riderId?: number;
  docKind?: RiderVerifyDocKind;
}): Promise<void> {
  /* intentionally empty */
}

export async function checkRiderElectronicVerifyRateLimit(
  _riderId: number,
  _docKind: RiderVerifyDocKind,
): Promise<RiderElectronicVerifyRateLimit> {
  return alwaysAllowed();
}

export async function tryConsumeRiderElectronicVerifyAttempt(
  _riderId: number,
  _docKind: RiderVerifyDocKind,
): Promise<RiderElectronicVerifyRateLimit & { consumed: boolean }> {
  return { ...alwaysAllowed(), consumed: true };
}

export async function loadRiderElectronicVerifyRateLimitMap(
  _riderId: number,
): Promise<Partial<Record<RiderVerifyDocKind, RiderElectronicVerifyRateLimit>>> {
  return {};
}

export async function assertRiderElectronicVerifyAllowed(
  _riderId: number,
  _docKind: RiderVerifyDocKind,
): Promise<RiderElectronicVerifyRateLimit> {
  return alwaysAllowed();
}
