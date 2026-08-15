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
 * ALL THREE are true: flag enabled, canonical submitted phone === canonical
 * configured phone, submitted OTP === configured OTP. Sharing the same digits
 * across bypasses (e.g. merchant and customer both `123456`) must NOT reject
 * the owning review phone as a "foreign" OTP.
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
 * Canonical 10-digit Indian subscriber number, or null if the input is not a
 * well-formed national / +91 / 91 / 0-prefixed mobile.
 *
 * After this step, comparison is exact string equality — never includes(),
 * startsWith(), or "last 10 of an arbitrary longer number".
 */
export function canonicalSubscriberDigits(phone: string | undefined | null): string | null {
  let d = digitsOnly(phone);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 10) return d;
  return null;
}

/** Mask for audit logs: 736*****981. Never the full number, never the OTP. */
export function maskReviewPhone(phone: string | undefined | null): string {
  const c = canonicalSubscriberDigits(phone);
  if (!c) return "****";
  return `${c.slice(0, 3)}*****${c.slice(-3)}`;
}

function phonesEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  const ca = canonicalSubscriberDigits(a);
  const cb = canonicalSubscriberDigits(b);
  return ca != null && ca === cb;
}

/** Map OTP `appType` to the bypass that owns that app. Unknown → all (legacy). */
export function reviewAppForOtpAppType(appType: string | undefined | null): ReviewApp | null {
  const t = typeof appType === "string" ? appType.trim().toLowerCase() : "";
  if (t === "merchant") return "partner";
  if (t === "rider") return "rider";
  if (t === "customer") return "customer";
  return null;
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
   * Log a bypass login event. Never logs the OTP. Phone is masked as
   * 736*****981. Safe to call anywhere — no-ops when the logger is missing.
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
  const phone = typeof cfg.phone === "string" ? cfg.phone.trim() : cfg.phone;
  const otp = typeof cfg.otp === "string" ? cfg.otp.trim() : cfg.otp;
  const armed = Boolean(cfg.enabled && phone && otp);

  return {
    app: cfg.app,

    isArmed(): boolean {
      return armed;
    },

    isReviewLogin(submittedPhone: string): boolean {
      // Disabled by default; a half-configured bypass stays off (fail closed).
      if (!armed) return false;
      return phonesEqual(submittedPhone, phone);
    },

    getReviewOtp(): string {
      if (!otp) {
        throw new Error(
          `ReviewModeService.getReviewOtp() called without ${cfg.otpEnvName} configured`,
        );
      }
      return otp;
    },

    logReviewLogin(log, args) {
      const appType =
        typeof args.appType === "string" && args.appType.trim() !== ""
          ? args.appType.trim().toLowerCase()
          : cfg.app;
      log?.info?.(
        {
          event: "REVIEW_LOGIN_BYPASS_USED",
          surface: cfg.app,
          appType,
          stage: args.stage,
          ok: args.ok,
          phone: maskReviewPhone(args.phone),
          environment: cfg.nodeEnv,
          timestamp: new Date().toISOString(),
          ip: args.ip,
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
 * Every configured bypass, in a stable order. When `appType` is present on the
 * OTP request (merchant / rider / customer), only that app's bypass may fire.
 */
export function createReviewBypasses(env: Env): ReviewModeService[] {
  return [
    createReviewModeService(env),
    createPartnerReviewLoginService(env),
    createRiderReviewLoginService(env),
  ];
}

function poolForAppType(
  services: ReviewModeService[],
  appType?: string | null,
): ReviewModeService[] {
  const app = reviewAppForOtpAppType(appType);
  if (!app) return services;
  return services.filter((s) => s.app === app);
}

/** The bypass that claims this phone (optionally scoped to OTP appType). */
export function matchReviewBypass(
  services: ReviewModeService[],
  phone: string,
  appType?: string | null,
): ReviewModeService | null {
  return poolForAppType(services, appType).find((s) => s.isReviewLogin(phone)) ?? null;
}

/**
 * True when `otp` equals an armed review OTP but this phone is NOT that
 * bypass's review number. Used when generating SMS OTPs so the review code
 * is never stored for a foreign phone.
 *
 * If this phone IS a review phone for the (optional) appType, returns false
 * even when another app's bypass happens to use the same digits — otherwise
 * merchant `123456` would be rejected because customer also uses `123456`.
 */
export function isReviewOtpOnForeignPhone(
  services: ReviewModeService[],
  phone: string,
  otp: string,
  appType?: string | null,
): boolean {
  if (matchReviewBypass(services, phone, appType)) return false;
  const pool = poolForAppType(services, appType);
  for (const s of pool) {
    if (!s.isArmed()) continue;
    try {
      if (otpsEqual(otp, s.getReviewOtp())) return true;
    } catch {
      // not configured
    }
  }
  return false;
}

// Exported for tests.
export const __test = { digitsOnly, phonesEqual, otpsEqual, canonicalSubscriberDigits, maskReviewPhone };
