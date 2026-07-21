/**
 * Review Login OTP Bypass — isolated helper.
 *
 * A Play Store / App Store reviewer needs to log in without an SMS arriving on
 * a phone they don't possess. This module is the SINGLE place in the codebase
 * that knows about that exception. The auth route consults
 * `isReviewLogin(phone)` at exactly two checkpoints — request and verify — and
 * otherwise nothing in the existing OTP / JWT / session / middleware logic
 * changes. There is no separate authentication path.
 *
 * Activation requires ALL of:
 *   - `REVIEW_LOGIN_BYPASS_ENABLED = true`
 *   - `REVIEW_LOGIN_PHONE` is set
 *   - `REVIEW_LOGIN_FIXED_OTP` is set (4–8 digits)
 *   - request phone matches `REVIEW_LOGIN_PHONE` after normalisation
 *
 * Any other phone, or the flag flipped to false, returns `false` from
 * `isReviewLogin()` and the normal path runs. Because the fixed OTP is only
 * ever SEEDED for the review phone, it can never authenticate another number.
 *
 * Backward compatibility: the legacy `GOOGLE_REVIEW_MODE / _PHONE / _OTP` names
 * are still honoured when the new ones are absent, so an environment already
 * running the old names keeps working until it is migrated. The new
 * `REVIEW_LOGIN_*` names win whenever they are present.
 *
 * No value here is hardcoded — everything is read from the environment.
 */
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";

/** Strip every non-digit. E.164 "+919999999999" -> "919999999999". */
function digitsOnly(phone: string | undefined | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Effective bypass config: new REVIEW_LOGIN_* names take precedence over legacy. */
function resolveConfig(env: Env): {
  enabled: boolean;
  phone: string | undefined;
  otp: string | undefined;
} {
  const enabled =
    env.REVIEW_LOGIN_BYPASS_ENABLED !== undefined
      ? env.REVIEW_LOGIN_BYPASS_ENABLED
      : env.GOOGLE_REVIEW_MODE === true;
  return {
    enabled,
    phone: env.REVIEW_LOGIN_PHONE ?? env.GOOGLE_REVIEW_PHONE,
    otp: env.REVIEW_LOGIN_FIXED_OTP ?? env.GOOGLE_REVIEW_OTP,
  };
}

/** Compare the inbound phone against the configured review phone, ignoring +/spaces. */
function phoneMatches(env: Env, phone: string): boolean {
  const { phone: reviewPhone } = resolveConfig(env);
  if (!reviewPhone) return false;
  const a = digitsOnly(phone);
  const b = digitsOnly(reviewPhone);
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
      const cfg = resolveConfig(env);
      // Disabled by default, and a mis-configured (half-set) bypass stays off.
      if (!cfg.enabled) return false;
      if (!cfg.phone || !cfg.otp) return false;
      return phoneMatches(env, phone);
    },

    getReviewOtp(): string {
      const { otp } = resolveConfig(env);
      if (!otp) {
        throw new Error(
          "ReviewModeService.getReviewOtp() called without REVIEW_LOGIN_FIXED_OTP configured",
        );
      }
      return otp;
    },

    logReviewLogin(log, args) {
      const phoneTail = digitsOnly(args.phone).slice(-4);
      log?.info?.(
        {
          event: "review_login_bypass",
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
export const __test = { digitsOnly, phoneMatches, resolveConfig };
