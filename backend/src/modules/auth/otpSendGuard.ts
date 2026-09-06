/**
 * Per-phone OTP SEND guard — the universal safety net against SMS-bombing / billing runaway.
 *
 * BOTH OTP send chokepoints (the Supabase "Send SMS" hook and the direct /otp/request path)
 * call this BEFORE spending an MSG91 SMS. It enforces, per phone number:
 *   1. a minimum interval between two SMS (cooldown), and
 *   2. a rolling 24h cap.
 * So no client bug, retry loop, or auto-resend — from ANY app — can trigger repeated real
 * SMS to a number (the incident where a review number received an OTP every minute).
 *
 * Redis-backed so the limit holds across replicas. If Redis is not configured/unavailable it
 * FAILS OPEN (allows the send) — this guard must never block legitimate logins because the
 * cache is down; the real gateway rate limits still apply.
 */
import { getRedis, isRedisConfigured } from "@gatimitra/redis";

const NS = "otp:send:";

/** Defaults chosen to stop a per-minute storm while never blocking a real user's login/resend. */
export const OTP_MIN_INTERVAL_SEC = Number(process.env.OTP_SEND_MIN_INTERVAL_SEC) || 45;
export const OTP_DAILY_CAP = Number(process.env.OTP_SEND_DAILY_CAP) || 15;

export type OtpSendGuardResult =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "daily_cap"; retryAfterSec: number };

/** Last-10-digit key so +91/0091/leading-zero variants of the same number share a limit. */
function phoneKey(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Atomically check the per-phone limits AND record this send. Call immediately before the
 * MSG91 send; if it returns `allowed:false`, DO NOT send — return 429 to the caller.
 */
export async function checkAndRecordOtpSend(
  phone: string,
  opts?: { minIntervalSec?: number; dailyCap?: number }
): Promise<OtpSendGuardResult> {
  const key = phoneKey(phone);
  if (!key || !isRedisConfigured()) return { allowed: true };

  const minInterval = Math.max(1, opts?.minIntervalSec ?? OTP_MIN_INTERVAL_SEC);
  const dailyCap = Math.max(1, opts?.dailyCap ?? OTP_DAILY_CAP);
  const cooldownKey = `${NS}cd:${key}`;
  const dayKey = `${NS}day:${key}:${new Date().toISOString().slice(0, 10)}`;

  try {
    const redis = getRedis();
    // Cooldown: SET NX EX — succeeds only if no SMS was sent within the last minInterval.
    const setOk = await redis.set(cooldownKey, "1", "EX", minInterval, "NX");
    if (setOk === null) {
      const ttl = await redis.ttl(cooldownKey).catch(() => minInterval);
      return { allowed: false, reason: "cooldown", retryAfterSec: ttl > 0 ? ttl : minInterval };
    }
    // Rolling daily cap.
    const count = await redis.incr(dayKey);
    if (count === 1) await redis.expire(dayKey, 24 * 3600);
    if (count > dailyCap) {
      const ttl = await redis.ttl(dayKey).catch(() => 3600);
      return { allowed: false, reason: "daily_cap", retryAfterSec: ttl > 0 ? ttl : 3600 };
    }
    return { allowed: true };
  } catch {
    // Redis error → fail open. Never wedge logins on a cache hiccup.
    return { allowed: true };
  }
}
