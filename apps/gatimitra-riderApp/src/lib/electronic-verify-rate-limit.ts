/**
 * Client helpers for Verify Instantly forceManual / hybrid fallback.
 * Timed rate-limit locks are permanently disabled.
 */

import { HttpError } from "@/src/services/http";
import { ApiError } from "@gatimitra/sdk";
import type { ElectronicVerifyRateLimitInfo } from "@/src/lib/electronic-verify-rate-limit-parse";

export type {
  ElectronicVerifyDocKind,
  ElectronicVerifyRateLimitInfo,
} from "@/src/lib/electronic-verify-rate-limit-parse";

export {
  formatVerifyCountdown,
  normalizeElectronicVerifyDocKind,
  parseElectronicVerifyRateLimitFromLimitsMap,
  parseElectronicVerifyRateLimitFromResponse,
  resolveRetryAfterSec,
} from "@/src/lib/electronic-verify-rate-limit-parse";

/** Always null — timed rate-limit locks are disabled. */
export function parseElectronicVerifyRateLimit(
  _error: unknown,
  _expectedDocKind?: string | null,
): ElectronicVerifyRateLimitInfo | null {
  return null;
}

/**
 * True when verify-document blocked Instant Verify (429 rate-limit or 503
 * temporary unavailable with forceManual) — open manual upload instead of
 * mis-labeling as "Server is busy".
 */
export function isElectronicVerifyForceManualError(error: unknown): boolean {
  const read = (raw: unknown): boolean => {
    if (!raw || typeof raw !== "object") return false;
    const rec = raw as Record<string, unknown>;
    const err = String(rec.error || "");
    return (
      rec.forceManual === true ||
      rec.rateLimited === true ||
      err === "verify_rate_limited" ||
      err === "verify_temporarily_unavailable"
    );
  };
  if (error instanceof HttpError) {
    if (error.status !== 429 && error.status !== 503) return false;
    try {
      return read(error.body ? JSON.parse(error.body) : null) || error.status === 429;
    } catch {
      return error.status === 429;
    }
  }
  if (error instanceof ApiError) {
    if (error.status !== 429 && error.status !== 503) return false;
    return read(error.payload) || error.status === 429;
  }
  return false;
}

/** Rider-facing reason from a verify-document error body (no secrets). */
export function extractElectronicVerifyBlockReason(
  error: unknown,
  fallback: string,
): string {
  const fromObj = (raw: unknown): string | null => {
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as Record<string, unknown>;
    for (const key of ["message", "providerMessage", "error", "reason"] as const) {
      const v = rec[key];
      if (
        typeof v === "string" &&
        v.trim() &&
        v !== "verify_rate_limited" &&
        v !== "verify_temporarily_unavailable"
      ) {
        return v.trim();
      }
    }
    if (rec.error === "verify_temporarily_unavailable") {
      return "Automatic verification is temporarily unavailable.";
    }
    if (rec.error === "verify_rate_limited" || rec.forceManual === true) {
      return "Verify Instantly is not available right now for this document.";
    }
    return null;
  };
  if (error instanceof HttpError) {
    try {
      return fromObj(error.body ? JSON.parse(error.body) : null) || fallback;
    } catch {
      return fallback;
    }
  }
  if (error instanceof ApiError) {
    return fromObj(error.payload) || fallback;
  }
  return fallback;
}
