/**
 * Guards for the Supabase Send SMS hook (/api/auth/send-sms): the one place every
 * `supabase.auth.signInWithOtp({ phone })` from every app turns into a paid MSG91 SMS.
 *
 * 1. SMS_BLOCKED_PHONES (comma-separated, empty by default): numbers that must never get
 *    a real SMS here, e.g. a store-review number while its backend fixed-OTP bypass is
 *    ON (Google Play's robots retry logins with it). Explicit opt-in: this hook cannot
 *    see the backend's bypass flags, and with a bypass off its number is a normal user.
 * 2. Per-phone cooldown + daily cap, mirroring backend/src/modules/auth/otpSendGuard.ts
 *    (45 s / 15 per day, same env overrides). The Supabase anon key ships in every app
 *    bundle, so anyone can call signInWithOtp for any number. Kept in memory: partnersite
 *    runs as one container and has no Redis; a restart only resets the counters.
 */

/** Last 10 digits — "+91 91131 94305", "919113194305" and "9113194305" share a key. */
export function phoneKey(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

type Env = Record<string, string | undefined>;

/** SMS_BLOCKED_PHONES as 10-digit keys. */
export function blockedPhones(env: Env = process.env): Set<string> {
  const out = new Set<string>();
  for (const part of String(env.SMS_BLOCKED_PHONES ?? "").split(",")) {
    const k = phoneKey(part);
    if (k) out.add(k);
  }
  return out;
}

export function isBlockedPhone(phone: string, env: Env = process.env): boolean {
  const k = phoneKey(phone);
  return k !== "" && blockedPhones(env).has(k);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

type SendRecord = { lastSentAtMs: number; dayStartMs: number; dayCount: number };
const sends = new Map<string, SendRecord>();
const DAY_MS = 24 * 60 * 60 * 1000;

export type SendDecision =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "daily_cap"; retryAfterSec: number };

/**
 * Records the send when allowed. Call only right before actually sending.
 * Phones that cannot be keyed are allowed (the caller validates format).
 */
export function checkAndRecordSmsSend(
  phone: string,
  nowMs: number = Date.now(),
  env: Env = process.env,
): SendDecision {
  const key = phoneKey(phone);
  if (!key) return { allowed: true };
  const minIntervalMs = positiveInt(env.OTP_SEND_MIN_INTERVAL_SEC, 45) * 1000;
  const dailyCap = positiveInt(env.OTP_SEND_DAILY_CAP, 15);

  if (sends.size > 10_000) {
    for (const [k, r] of sends) if (nowMs - r.dayStartMs > DAY_MS) sends.delete(k);
  }

  const rec = sends.get(key);
  if (rec) {
    const sinceLast = nowMs - rec.lastSentAtMs;
    if (sinceLast < minIntervalMs) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSec: Math.ceil((minIntervalMs - sinceLast) / 1000),
      };
    }
    if (nowMs - rec.dayStartMs < DAY_MS) {
      if (rec.dayCount >= dailyCap) {
        return {
          allowed: false,
          reason: "daily_cap",
          retryAfterSec: Math.ceil((rec.dayStartMs + DAY_MS - nowMs) / 1000),
        };
      }
      rec.dayCount += 1;
      rec.lastSentAtMs = nowMs;
      return { allowed: true };
    }
  }
  sends.set(key, { lastSentAtMs: nowMs, dayStartMs: nowMs, dayCount: 1 });
  return { allowed: true };
}

/** Test-only reset. */
export function __resetSmsSendGuardForTests(): void {
  sends.clear();
}
