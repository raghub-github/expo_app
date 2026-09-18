/**
 * Normalize helpers for Verify Instantly — timed rate-limit locks are disabled.
 */

import {
  resolveRetryAfterSec,
  type ElectronicVerifyRateLimitInfo,
} from "./electronic-verify-rate-limit-parse";

/** Always false — rate-limit message detection is disabled. */
export function isElectronicVerifyRateLimitMessage(
  _message: string | null | undefined,
): boolean {
  return false;
}

export type NormalizeRateLimitOptions = {
  allowRelativeAnchor?: boolean;
  nowMs?: number;
};

/** Always null — timed rate-limit locks are disabled. */
export function normalizeAppliedElectronicVerifyRateLimit(
  _next: ElectronicVerifyRateLimitInfo,
  _docKind: string,
  _opts: NormalizeRateLimitOptions | number = {},
): ElectronicVerifyRateLimitInfo | null {
  return null;
}

/** Remaining seconds from absolute expiry (preferred) or retryAfterSec. */
export function remainingSecFromRateLimit(
  info: Pick<ElectronicVerifyRateLimitInfo, "resetsAt" | "retryAfterSec"> | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!info) return 0;
  if (info.resetsAt) {
    const ms = new Date(info.resetsAt).getTime() - nowMs;
    if (Number.isFinite(ms)) return Math.max(0, Math.ceil(ms / 1000));
  }
  return resolveRetryAfterSec(info);
}
