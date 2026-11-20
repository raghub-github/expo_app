/**
 * Per-phone OTP SEND guard — the universal safety net against SMS-bombing / billing runaway.
 *
 * BOTH OTP send chokepoints (the Supabase "Send SMS" hook and the direct /otp/request path)
 * call this BEFORE spending an MSG91 SMS. It enforces, per phone number:
 *   1. a minimum interval between two SMS (cooldown),
 *   2. a rolling 15-minute cap,
 *   3. a rolling 1-hour cap, and
 *   4. a rolling 24h cap.
 *
 * So no client bug, retry loop, or auto-resend — from ANY app — can trigger repeated real
 * SMS to a number.
 *
 * Redis-backed so the limit holds across replicas. If Redis is unavailable, an in-process
 * memory fallback still enforces the same limits (fail closed for SMS spend). Limits are
 * configurable via env; defaults are conservative for billing safety while allowing normal
 * login / resend.
 */
import { getRedis, isRedisConfigured } from "@gatimitra/redis";

const NS = "otp:send:";

/** Defaults: stop storms without blocking a normal user resend after ~1 minute. */
export const OTP_MIN_INTERVAL_SEC = Number(process.env.OTP_SEND_MIN_INTERVAL_SEC) || 60;
export const OTP_WINDOW_15M_CAP = Number(process.env.OTP_SEND_15M_CAP) || 3;
export const OTP_WINDOW_1H_CAP = Number(process.env.OTP_SEND_1H_CAP) || 5;
export const OTP_DAILY_CAP = Number(process.env.OTP_SEND_DAILY_CAP) || 15;

export type OtpSendGuardReason = "cooldown" | "window_15m" | "window_1h" | "daily_cap";

export type OtpSendGuardResult =
  | { allowed: true }
  | { allowed: false; reason: OtpSendGuardReason; retryAfterSec: number };

type MemRecord = {
  lastSentAtMs: number;
  stamps: number[];
};

const memorySends = new Map<string, MemRecord>();
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_15M_MS = 15 * 60 * 1000;
const WINDOW_1H_MS = 60 * 60 * 1000;

/** Last-10-digit key so +91/0091/leading-zero variants of the same number share a limit. */
export function phoneKey(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function positiveInt(raw: number | undefined, fallback: number): number {
  return Number.isFinite(raw) && (raw as number) > 0 ? Math.floor(raw as number) : fallback;
}

function checkMemory(
  key: string,
  nowMs: number,
  opts: { minIntervalSec: number; window15mCap: number; window1hCap: number; dailyCap: number },
): OtpSendGuardResult {
  if (memorySends.size > 10_000) {
    for (const [k, r] of memorySends) {
      if (nowMs - r.lastSentAtMs > DAY_MS) memorySends.delete(k);
    }
  }

  const rec = memorySends.get(key);
  const stamps = (rec?.stamps ?? []).filter((t) => nowMs - t < DAY_MS);

  if (rec) {
    const sinceLast = nowMs - rec.lastSentAtMs;
    const minIntervalMs = opts.minIntervalSec * 1000;
    if (sinceLast < minIntervalMs) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSec: Math.ceil((minIntervalMs - sinceLast) / 1000),
      };
    }
  }

  const in15 = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).length;
  if (in15 >= opts.window15mCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "window_15m",
      retryAfterSec: Math.ceil((oldest + WINDOW_15M_MS - nowMs) / 1000),
    };
  }

  const in1h = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).length;
  if (in1h >= opts.window1hCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "window_1h",
      retryAfterSec: Math.ceil((oldest + WINDOW_1H_MS - nowMs) / 1000),
    };
  }

  if (stamps.length >= opts.dailyCap) {
    const oldest = stamps.sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "daily_cap",
      retryAfterSec: Math.ceil((oldest + DAY_MS - nowMs) / 1000),
    };
  }

  stamps.push(nowMs);
  memorySends.set(key, { lastSentAtMs: nowMs, stamps });
  return { allowed: true };
}

/**
 * Atomically check the per-phone limits AND record this send. Call immediately before the
 * MSG91 send; if it returns `allowed:false`, DO NOT send — return 429 to the caller.
 */
export async function checkAndRecordOtpSend(
  phone: string,
  opts?: {
    minIntervalSec?: number;
    window15mCap?: number;
    window1hCap?: number;
    dailyCap?: number;
  },
): Promise<OtpSendGuardResult> {
  const key = phoneKey(phone);
  if (!key) return { allowed: true };

  const minInterval = Math.max(1, opts?.minIntervalSec ?? OTP_MIN_INTERVAL_SEC);
  const window15mCap = Math.max(1, positiveInt(opts?.window15mCap, OTP_WINDOW_15M_CAP));
  const window1hCap = Math.max(1, positiveInt(opts?.window1hCap, OTP_WINDOW_1H_CAP));
  const dailyCap = Math.max(1, opts?.dailyCap ?? OTP_DAILY_CAP);
  const limits = { minIntervalSec: minInterval, window15mCap, window1hCap, dailyCap };

  if (!isRedisConfigured()) {
    return checkMemory(key, Date.now(), limits);
  }

  const cooldownKey = `${NS}cd:${key}`;
  const w15Key = `${NS}w15:${key}`;
  const w1hKey = `${NS}w1h:${key}`;
  const dayKey = `${NS}day:${key}:${new Date().toISOString().slice(0, 10)}`;

  try {
    const redis = getRedis();
    // Cooldown: SET NX EX — succeeds only if no SMS was sent within the last minInterval.
    const setOk = await redis.set(cooldownKey, "1", "EX", minInterval, "NX");
    if (setOk === null) {
      const ttl = await redis.ttl(cooldownKey).catch(() => minInterval);
      return { allowed: false, reason: "cooldown", retryAfterSec: ttl > 0 ? ttl : minInterval };
    }

    const w15 = await redis.incr(w15Key);
    if (w15 === 1) await redis.expire(w15Key, 15 * 60);
    if (w15 > window15mCap) {
      const ttl = await redis.ttl(w15Key).catch(() => 15 * 60);
      return { allowed: false, reason: "window_15m", retryAfterSec: ttl > 0 ? ttl : 15 * 60 };
    }

    const w1h = await redis.incr(w1hKey);
    if (w1h === 1) await redis.expire(w1hKey, 60 * 60);
    if (w1h > window1hCap) {
      const ttl = await redis.ttl(w1hKey).catch(() => 60 * 60);
      return { allowed: false, reason: "window_1h", retryAfterSec: ttl > 0 ? ttl : 60 * 60 };
    }

    const count = await redis.incr(dayKey);
    if (count === 1) await redis.expire(dayKey, 24 * 3600);
    if (count > dailyCap) {
      const ttl = await redis.ttl(dayKey).catch(() => 3600);
      return { allowed: false, reason: "daily_cap", retryAfterSec: ttl > 0 ? ttl : 3600 };
    }
    return { allowed: true };
  } catch {
    // Redis error → in-memory fallback (still protect billing; never unlimited SMS).
    return checkMemory(key, Date.now(), limits);
  }
}

/** Test-only reset for in-memory fallback. */
export function __resetOtpSendGuardMemoryForTests(): void {
  memorySends.clear();
}
