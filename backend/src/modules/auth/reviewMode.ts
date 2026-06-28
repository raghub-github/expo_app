/**
 * Google Play Review Mode — isolated helper.
 *
 * The Play reviewer needs to log in without an SMS arriving on a phone they
 * don't possess. This module is the SINGLE place in the codebase that knows
 * about that exception. The auth route consults `isReviewLogin(phone)` at
 * exactly two checkpoints — request and verify — and otherwise nothing in
 * the existing OTP / JWT / middleware logic changes.
 *
 * Activation requires ALL of:
 *   - `GOOGLE_REVIEW_MODE = true`
 *   - `GOOGLE_REVIEW_PHONE` is set
 *   - `GOOGLE_REVIEW_OTP` is set (4–8 digits)
 *   - request phone matches `GOOGLE_REVIEW_PHONE` after normalisation
 *
 * Any other phone, or the flag flipped to false, returns `false` from
 * `isReviewLogin()` and the normal path runs.
 */
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";

/** Strip every non-digit. E.164 "+919999999999" -> "919999999999". */
function digitsOnly(phone: string | undefined | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Compare the inbound phone against `GOOGLE_REVIEW_PHONE`, ignoring +/spaces. */
function phoneMatches(env: Env, phone: string): boolean {
  if (!env.GOOGLE_REVIEW_PHONE) return false;
  const a = digitsOnly(phone);
  const b = digitsOnly(env.GOOGLE_REVIEW_PHONE);
  if (a.length === 0 || b.length === 0) return false;
  // tolerate country-code differences by matching the trailing 10 digits.
  const tailA = a.slice(-10);
  const tailB = b.slice(-10);
  return tailA === tailB && tailA.length === 10;
}

export interface ReviewModeService {
  /** Whether review mode is enabled AND the given phone is the review phone. */
  isReviewLogin(phone: string): boolean;
  /** The fixed OTP to seed for the review phone. Throws if not configured. */
  getReviewOtp(): string;
  /**
   * Log a review login attempt. Never logs the OTP itself. Safe to call from
   * any request handler — falls through silently when logger is missing.
   */
  logReviewLogin(
    log: FastifyBaseLogger | undefined,
    args: { phone: string; ip: string | null; stage: "request" | "verify"; ok: boolean },
  ): void;
}

export function createReviewModeService(env: Env): ReviewModeService {
  return {
    isReviewLogin(phone: string): boolean {
      if (!env.GOOGLE_REVIEW_MODE) return false;
      if (!env.GOOGLE_REVIEW_PHONE || !env.GOOGLE_REVIEW_OTP) return false;
      return phoneMatches(env, phone);
    },

    getReviewOtp(): string {
      if (!env.GOOGLE_REVIEW_OTP) {
        throw new Error(
          "ReviewModeService.getReviewOtp() called without GOOGLE_REVIEW_OTP configured",
        );
      }
      return env.GOOGLE_REVIEW_OTP;
    },

    logReviewLogin(log, args) {
      const phoneTail = digitsOnly(args.phone).slice(-4);
      log?.info?.(
        {
          event: "google_review_login",
          stage: args.stage,
          ok: args.ok,
          phoneTail,
          ip: args.ip,
          env: env.NODE_ENV,
          ts: new Date().toISOString(),
        },
        "[ReviewMode] login event",
      );
    },
  };
}

// Exported for tests.
export const __test = { digitsOnly, phoneMatches };
