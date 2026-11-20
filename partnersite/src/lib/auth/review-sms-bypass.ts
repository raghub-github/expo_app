/**
 * Mirror of backend reviewMode SMS skip for the Supabase Send SMS hook.
 *
 * While a review bypass is ARMED (enable flag + phone + fixed OTP all set), that
 * phone must never receive a billable MSG91 SMS. Login completes via backend
 * /v1/auth/otp/request with the fixed review OTP — not via the SMS code Supabase
 * generated for this hook invocation.
 *
 * Env (same names as backend — never hardcode numbers):
 *   GOOGLE_REVIEW_MODE + GOOGLE_REVIEW_PHONE + GOOGLE_REVIEW_OTP
 *   REVIEW_LOGIN_BYPASS_ENABLED + REVIEW_LOGIN_PHONE + REVIEW_LOGIN_FIXED_OTP
 *   RIDER_REVIEW_LOGIN_BYPASS_ENABLED + RIDER_REVIEW_LOGIN_PHONE + RIDER_REVIEW_LOGIN_FIXED_OTP
 *   SMS_BLOCKED_PHONES (explicit extra blocklist)
 */

import { phoneKey } from "./sms-send-guard";

type Env = Record<string, string | undefined>;

function truthy(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Canonical 10-digit IN subscriber — matches backend canonicalSubscriberDigits. */
export function canonicalSubscriberDigits(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 10) return d;
  // Longer inputs: last 10 when they look like country+national (e.g. 9199…)
  if (d.length > 10) {
    const last10 = d.slice(-10);
    return last10.length === 10 ? last10 : null;
  }
  return null;
}

export function maskReviewPhone(phone: string | null | undefined): string {
  const c = canonicalSubscriberDigits(phone);
  if (!c) return "****";
  return `${c.slice(0, 3)}*****${c.slice(-3)}`;
}

type ArmedBypass = {
  surface: "customer" | "partner" | "rider";
  phoneKey: string;
};

function armedBypasses(env: Env): ArmedBypass[] {
  const out: ArmedBypass[] = [];

  const add = (
    surface: ArmedBypass["surface"],
    enabled: boolean,
    phone: string | undefined,
    otp: string | undefined,
  ) => {
    if (!enabled) return;
    const p = typeof phone === "string" ? phone.trim() : "";
    const o = typeof otp === "string" ? otp.trim() : "";
    if (!p || !o) return; // half-configured → fail closed (do not suppress SMS)
    const key = canonicalSubscriberDigits(p);
    if (!key) return;
    out.push({ surface, phoneKey: key });
  };

  add(
    "customer",
    truthy(env.GOOGLE_REVIEW_MODE),
    env.GOOGLE_REVIEW_PHONE,
    env.GOOGLE_REVIEW_OTP,
  );
  add(
    "partner",
    truthy(env.REVIEW_LOGIN_BYPASS_ENABLED),
    env.REVIEW_LOGIN_PHONE,
    env.REVIEW_LOGIN_FIXED_OTP,
  );
  add(
    "rider",
    truthy(env.RIDER_REVIEW_LOGIN_BYPASS_ENABLED),
    env.RIDER_REVIEW_LOGIN_PHONE,
    env.RIDER_REVIEW_LOGIN_FIXED_OTP,
  );

  return out;
}

/** True when an armed review bypass owns this phone (any app). */
export function isArmedReviewPhone(phone: string, env: Env = process.env): boolean {
  const key = canonicalSubscriberDigits(phone);
  if (!key) return false;
  return armedBypasses(env).some((b) => b.phoneKey === key);
}

export function matchArmedReviewSurface(
  phone: string,
  env: Env = process.env,
): ArmedBypass["surface"] | null {
  const key = canonicalSubscriberDigits(phone);
  if (!key) return null;
  return armedBypasses(env).find((b) => b.phoneKey === key)?.surface ?? null;
}

/**
 * Never send MSG91 when:
 * 1) phone matches an armed review bypass, or
 * 2) phone is listed in SMS_BLOCKED_PHONES.
 */
export function shouldSuppressMsg91Sms(
  phone: string,
  env: Env = process.env,
): { suppress: true; reason: "review_bypass" | "sms_blocked"; surface?: string } | { suppress: false } {
  if (isArmedReviewPhone(phone, env)) {
    return {
      suppress: true,
      reason: "review_bypass",
      surface: matchArmedReviewSurface(phone, env) ?? undefined,
    };
  }
  const k = phoneKey(phone) || canonicalSubscriberDigits(phone) || "";
  if (k) {
    for (const part of String(env.SMS_BLOCKED_PHONES ?? "").split(",")) {
      const bk = canonicalSubscriberDigits(part) || phoneKey(part);
      if (bk && bk === k) {
        return { suppress: true, reason: "sms_blocked" };
      }
    }
  }
  return { suppress: false };
}

/** Fixed review OTP for an armed phone — used by cxsite local verify without MSG91. */
export function getArmedReviewOtp(phone: string, env: Env = process.env): string | null {
  const key = canonicalSubscriberDigits(phone);
  if (!key) return null;

  const rows: Array<{ enabled: boolean; phone?: string; otp?: string }> = [
    {
      enabled: truthy(env.GOOGLE_REVIEW_MODE),
      phone: env.GOOGLE_REVIEW_PHONE,
      otp: env.GOOGLE_REVIEW_OTP,
    },
    {
      enabled: truthy(env.REVIEW_LOGIN_BYPASS_ENABLED),
      phone: env.REVIEW_LOGIN_PHONE,
      otp: env.REVIEW_LOGIN_FIXED_OTP,
    },
    {
      enabled: truthy(env.RIDER_REVIEW_LOGIN_BYPASS_ENABLED),
      phone: env.RIDER_REVIEW_LOGIN_PHONE,
      otp: env.RIDER_REVIEW_LOGIN_FIXED_OTP,
    },
  ];

  for (const r of rows) {
    if (!r.enabled || !r.phone?.trim() || !r.otp?.trim()) continue;
    if (canonicalSubscriberDigits(r.phone) === key) return r.otp.trim();
  }
  return null;
}
