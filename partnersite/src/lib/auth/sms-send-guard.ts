/**
 * Guards for the Supabase Send SMS hook (/api/auth/send-sms).
 *
 * Per-phone cooldown + rolling window caps + daily cap, mirroring
 * backend/src/modules/auth/otpSendGuard.ts (60 s / 3 per 15m / 5 per hour / 15 per day).
 *
 * Production: Redis-backed via REDIS_URL (shared across replicas, same key namespace
 * as backend: `otp:send:`). If Redis is unset or errors, falls back to in-process
 * memory (never unlimited).
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

type SendRecord = { lastSentAtMs: number; stamps: number[] };
const sends = new Map<string, SendRecord>();
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_15M_MS = 15 * 60 * 1000;
const WINDOW_1H_MS = 60 * 60 * 1000;
const NS = "otp:send:";

export type SendDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "cooldown" | "window_15m" | "window_1h" | "daily_cap";
      retryAfterSec: number;
    };

function limitsFromEnv(env: Env) {
  return {
    minIntervalSec: positiveInt(env.OTP_SEND_MIN_INTERVAL_SEC, 60),
    window15mCap: positiveInt(env.OTP_SEND_15M_CAP, 3),
    window1hCap: positiveInt(env.OTP_SEND_1H_CAP, 5),
    dailyCap: positiveInt(env.OTP_SEND_DAILY_CAP, 15),
  };
}

/**
 * In-memory / sync path (tests + Redis fallback). Prefer checkAndRecordSmsSendAsync
 * in production request handlers.
 */
export function checkAndRecordSmsSend(
  phone: string,
  nowMs: number = Date.now(),
  env: Env = process.env,
): SendDecision {
  const key = phoneKey(phone);
  if (!key) return { allowed: true };
  const { minIntervalSec, window15mCap, window1hCap, dailyCap } = limitsFromEnv(env);
  const minIntervalMs = minIntervalSec * 1000;

  if (sends.size > 10_000) {
    for (const [k, r] of sends) if (nowMs - r.lastSentAtMs > DAY_MS) sends.delete(k);
  }

  const rec = sends.get(key);
  const stamps = (rec?.stamps ?? []).filter((t) => nowMs - t < DAY_MS);

  if (rec) {
    const sinceLast = nowMs - rec.lastSentAtMs;
    if (sinceLast < minIntervalMs) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSec: Math.ceil((minIntervalMs - sinceLast) / 1000),
      };
    }
  }

  const in15 = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).length;
  if (in15 >= window15mCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "window_15m",
      retryAfterSec: Math.ceil((oldest + WINDOW_15M_MS - nowMs) / 1000),
    };
  }

  const in1h = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).length;
  if (in1h >= window1hCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "window_1h",
      retryAfterSec: Math.ceil((oldest + WINDOW_1H_MS - nowMs) / 1000),
    };
  }

  if (stamps.length >= dailyCap) {
    const oldest = stamps.sort((a, b) => a - b)[0]!;
    return {
      allowed: false,
      reason: "daily_cap",
      retryAfterSec: Math.ceil((oldest + DAY_MS - nowMs) / 1000),
    };
  }

  stamps.push(nowMs);
  sends.set(key, { lastSentAtMs: nowMs, stamps });
  return { allowed: true };
}

function redisConfigured(env: Env = process.env): boolean {
  const url = env.REDIS_URL?.trim();
  return Boolean(url && url.length >= 10);
}

type RedisLike = {
  set: (...args: unknown[]) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, sec: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
};

let _redis: RedisLike | null = null;
let _redisInitFailed = false;

async function getRedisClient(env: Env): Promise<RedisLike | null> {
  if (!redisConfigured(env) || _redisInitFailed) return null;
  if (_redis) return _redis;
  try {
    const url = env.REDIS_URL!.trim();
    const IORedis = (await import("ioredis")).default;
    const client = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    await client.connect().catch(async () => {
      // Some ioredis versions auto-connect; ignore if already connecting.
    });
    _redis = client as unknown as RedisLike;
    return _redis;
  } catch {
    _redisInitFailed = true;
    return null;
  }
}

/**
 * Production entry: Redis-first (shared with backend `otp:send:` keys), memory fallback.
 */
export async function checkAndRecordSmsSendAsync(
  phone: string,
  env: Env = process.env,
): Promise<SendDecision> {
  const key = phoneKey(phone);
  if (!key) return { allowed: true };
  const { minIntervalSec, window15mCap, window1hCap, dailyCap } = limitsFromEnv(env);

  const redis = await getRedisClient(env);
  if (!redis) {
    return checkAndRecordSmsSend(phone, Date.now(), env);
  }

  const cooldownKey = `${NS}cd:${key}`;
  const w15Key = `${NS}w15:${key}`;
  const w1hKey = `${NS}w1h:${key}`;
  const dayKey = `${NS}day:${key}:${new Date().toISOString().slice(0, 10)}`;

  try {
    const setOk = await redis.set(cooldownKey, "1", "EX", minIntervalSec, "NX");
    if (setOk === null) {
      const ttl = await redis.ttl(cooldownKey).catch(() => minIntervalSec);
      return { allowed: false, reason: "cooldown", retryAfterSec: ttl > 0 ? ttl : minIntervalSec };
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
    return checkAndRecordSmsSend(phone, Date.now(), env);
  }
}

/** Test-only reset. */
export function __resetSmsSendGuardForTests(): void {
  sends.clear();
  _redis = null;
  _redisInitFailed = false;
}
