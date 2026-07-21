/**
 * App-store review login bypasses — isolated helper.
 *
 * A store reviewer needs to log in without an SMS arriving on a phone they
 * don't possess. This module is the SINGLE place in the codebase that knows
 * about that exception. The auth route consults it at exactly two checkpoints —
 * OTP request and OTP verify — and nothing else in the existing OTP / JWT /
 * session / middleware logic changes. There is no separate authentication path.
 *
 * There are TWO INDEPENDENT bypasses, one per app. They never share config and
 * never fall back to each other, so enabling or rotating one cannot affect the
 * other:
 *
 *   Customer app  → GOOGLE_REVIEW_MODE / GOOGLE_REVIEW_PHONE / GOOGLE_REVIEW_OTP
 *   Merchant app  → REVIEW_LOGIN_BYPASS_ENABLED / REVIEW_LOGIN_PHONE /
 *                   REVIEW_LOGIN_FIXED_OTP
 *
 * A bypass activates only when ALL of the following hold:
 *   - its enable flag is true
 *   - its phone is configured
 *   - its fixed OTP is configured (4–8 digits)
 *   - the inbound phone matches its phone after normalisation
 *
 * Because the fixed OTP is only ever SEEDED for its own configured phone, it can
 * never authenticate any other number — including the other app's review number.
 *
 * Nothing here is hardcoded; every value is read from the environment, and both
 * bypasses are disabled by default.
 */
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";

/** Which app a bypass belongs to — used for logging and isolation only. */
export type ReviewApp = "customer" | "merchant";

/** Strip every non-digit. E.164 "+919999999999" -> "919999999999". */
function digitsOnly(phone: string | undefined | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Match two phone numbers on their trailing 10 digits so "+917367878981",
 * "917367878981" and "7367878981" are all the same subscriber. Requires a full
 * 10-digit tail on both sides, so a short/garbage value can never match.
 */
function phonesEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da.length === 0 || db.length === 0) return false;
  const tailA = da.slice(-10);
  const tailB = db.slice(-10);
  return tailA === tailB && tailA.length === 10;
}

export interface ReviewModeService {
  /** Which app this bypass serves. */
  readonly app: ReviewApp;
  /** Whether this bypass is enabled AND the given phone is its review phone. */
  isReviewLogin(phone: string): boolean;
  /** The fixed OTP to seed for this bypass. Throws if not configured. */
  getReviewOtp(): string;
  /**
   * Log a bypass login event. Never logs the OTP, and never more than the last
   * 4 phone digits. Safe to call anywhere — no-ops when the logger is missing.
   */
  logReviewLogin(
    log: FastifyBaseLogger | undefined,
    args: { phone: string; ip: string | null; stage: "request" | "verify"; ok: boolean },
  ): void;
}

interface BypassConfig {
  app: ReviewApp;
  enabled: boolean;
  phone: string | undefined;
  otp: string | undefined;
  /** Env var name of the fixed OTP — used only for a precise error message. */
  otpEnvName: string;
  nodeEnv: string;
}

function createBypass(cfg: BypassConfig): ReviewModeService {
  return {
    app: cfg.app,

    isReviewLogin(phone: string): boolean {
      // Disabled by default; a half-configured bypass stays off (fail closed).
      if (!cfg.enabled) return false;
      if (!cfg.phone || !cfg.otp) return false;
      return phonesEqual(phone, cfg.phone);
    },

    getReviewOtp(): string {
      if (!cfg.otp) {
        throw new Error(
          `ReviewModeService.getReviewOtp() called without ${cfg.otpEnvName} configured`,
        );
      }
      return cfg.otp;
    },

    logReviewLogin(log, args) {
      log?.info?.(
        {
          event: "review_login_bypass",
          app: cfg.app,
          stage: args.stage,
          ok: args.ok,
          phoneTail: digitsOnly(args.phone).slice(-4),
          ip: args.ip,
          env: cfg.nodeEnv,
          ts: new Date().toISOString(),
        },
        "[ReviewMode] login event",
      );
    },
  };
}

/** Customer app bypass — GOOGLE_REVIEW_* (pre-existing, unchanged semantics). */
export function createReviewModeService(env: Env): ReviewModeService {
  return createBypass({
    app: "customer",
    enabled: env.GOOGLE_REVIEW_MODE === true,
    phone: env.GOOGLE_REVIEW_PHONE,
    otp: env.GOOGLE_REVIEW_OTP,
    otpEnvName: "GOOGLE_REVIEW_OTP",
    nodeEnv: env.NODE_ENV,
  });
}

/** Merchant app bypass — REVIEW_LOGIN_* (independent of the customer one). */
export function createMerchantReviewLoginService(env: Env): ReviewModeService {
  return createBypass({
    app: "merchant",
    enabled: env.REVIEW_LOGIN_BYPASS_ENABLED === true,
    phone: env.REVIEW_LOGIN_PHONE,
    otp: env.REVIEW_LOGIN_FIXED_OTP,
    otpEnvName: "REVIEW_LOGIN_FIXED_OTP",
    nodeEnv: env.NODE_ENV,
  });
}

/**
 * Every configured bypass, in a stable order. The OTP request endpoint has no
 * appType (adding one would require a frontend change), so the phone number is
 * the discriminator — each bypass owns a distinct number.
 */
export function createReviewBypasses(env: Env): ReviewModeService[] {
  return [createReviewModeService(env), createMerchantReviewLoginService(env)];
}

/** The bypass that claims this phone, or null when the normal SMS flow applies. */
export function matchReviewBypass(
  services: ReviewModeService[],
  phone: string,
): ReviewModeService | null {
  return services.find((s) => s.isReviewLogin(phone)) ?? null;
}

// Exported for tests.
export const __test = { digitsOnly, phonesEqual };
