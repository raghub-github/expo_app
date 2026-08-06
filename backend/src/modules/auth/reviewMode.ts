/**
 * App-store review login bypasses — isolated helper.
 *
 * A store reviewer needs to log in without an SMS arriving on a phone they
 * don't possess. This module is the SINGLE place in the codebase that knows
 * about that exception. The auth route consults it at exactly two checkpoints —
 * OTP request and OTP verify — and nothing else in the existing OTP / JWT /
 * session / middleware logic changes. There is no separate authentication path.
 *
 * There are THREE INDEPENDENT bypasses. They never share config and never fall
 * back to each other, so enabling or rotating one cannot affect the others:
 *
 *   Customer app   → GOOGLE_REVIEW_MODE / GOOGLE_REVIEW_PHONE / GOOGLE_REVIEW_OTP
 *   Merchant app   → REVIEW_LOGIN_BYPASS_ENABLED / REVIEW_LOGIN_PHONE / REVIEW_LOGIN_FIXED_OTP
 *   Rider app      → RIDER_REVIEW_LOGIN_BYPASS_ENABLED / RIDER_REVIEW_LOGIN_PHONE /
 *                    RIDER_REVIEW_LOGIN_FIXED_OTP
 *
 * Critical invariant: a fixed review OTP is ONLY seeded into the OTP store when
 * the request phone matches that bypass's configured phone. On verify we also
 * reject any attempt to use a review OTP against a non-review phone
 * (defense-in-depth against store poisoning / collisions).
 *
 * Nothing here is hardcoded; every value is read from the environment, and all
 * bypasses are disabled by default.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";

/**
 * Which app a bypass belongs to — used for logging and isolation only.
 * ("partner" is the merchant bypass name, kept for backward compatibility.)
 */
export type ReviewApp = "customer" | "partner" | "rider";

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

/** Constant-time OTP compare — rejects length mismatch without leaking timing. */
export function otpsEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export interface ReviewModeService {
  /** Which app this bypass serves. */
  readonly app: ReviewApp;
  /** True when enable flag + phone + OTP are all configured. */
  isArmed(): boolean;
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
    args: {
      phone: string;
      ip: string | null;
      stage: "request" | "verify";
      ok: boolean;
      appType?: string;
    },
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
  const armed = Boolean(cfg.enabled && cfg.phone && cfg.otp);

  return {
    app: cfg.app,

    isArmed(): boolean {
      return armed;
    },

    isReviewLogin(phone: string): boolean {
      // Disabled by default; a half-configured bypass stays off (fail closed).
      if (!armed) return false;
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
      const appType =
        typeof args.appType === "string" && args.appType.trim() !== ""
          ? args.appType.trim().toLowerCase()
          : cfg.app;
      log?.info?.(
        {
          event: "review_login_bypass",
          surface: cfg.app,
          appType,
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

/** Customer app bypass — GOOGLE_REVIEW_* . */
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

/**
 * Merchant app bypass — REVIEW_LOGIN_* (independent of customer + rider).
 */
export function createPartnerReviewLoginService(env: Env): ReviewModeService {
  return createBypass({
    app: "partner",
    enabled: env.REVIEW_LOGIN_BYPASS_ENABLED === true,
    phone: env.REVIEW_LOGIN_PHONE,
    otp: env.REVIEW_LOGIN_FIXED_OTP,
    otpEnvName: "REVIEW_LOGIN_FIXED_OTP",
    nodeEnv: env.NODE_ENV,
  });
}

/**
 * Rider app bypass — RIDER_REVIEW_LOGIN_* (independent of merchant + customer).
 */
export function createRiderReviewLoginService(env: Env): ReviewModeService {
  return createBypass({
    app: "rider",
    enabled: env.RIDER_REVIEW_LOGIN_BYPASS_ENABLED === true,
    phone: env.RIDER_REVIEW_LOGIN_PHONE,
    otp: env.RIDER_REVIEW_LOGIN_FIXED_OTP,
    otpEnvName: "RIDER_REVIEW_LOGIN_FIXED_OTP",
    nodeEnv: env.NODE_ENV,
  });
}

/**
 * Every configured bypass, in a stable order. The OTP request endpoint has no
 * appType, so the phone number is the discriminator — each bypass owns a
 * distinct number.
 */
export function createReviewBypasses(env: Env): ReviewModeService[] {
  return [
    createReviewModeService(env),
    createPartnerReviewLoginService(env),
    createRiderReviewLoginService(env),
  ];
}

/** The bypass that claims this phone, or null when the normal SMS flow applies. */
export function matchReviewBypass(
  services: ReviewModeService[],
  phone: string,
): ReviewModeService | null {
  return services.find((s) => s.isReviewLogin(phone)) ?? null;
}

/**
 * Defense-in-depth: reject when the submitted OTP equals an armed bypass's
 * fixed OTP but the phone is NOT that bypass's review phone.
 * Prevents review OTP reuse on arbitrary numbers.
 */
export function isReviewOtpOnForeignPhone(
  services: ReviewModeService[],
  phone: string,
  otp: string,
): boolean {
  for (const s of services) {
    if (!s.isArmed()) continue;
    if (s.isReviewLogin(phone)) continue;
    try {
      if (otpsEqual(otp, s.getReviewOtp())) return true;
    } catch {
      // not configured
    }
  }
  return false;
}

// Exported for tests.
export const __test = { digitsOnly, phonesEqual, otpsEqual };
