/**
 * OTP SMS guard for cxsite public `/api/auth/otp`.
 * Redis-backed when REDIS_URL is set (shared `otp:send:` namespace with backend/partnersite).
 * Falls back to in-process memory — never unlimited.
 */

type SendRecord = { lastSentAtMs: number; stamps: number[] }

const phoneSends = new Map<string, SendRecord>()
const ipSends = new Map<string, SendRecord>()

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_15M_MS = 15 * 60 * 1000
const WINDOW_1H_MS = 60 * 60 * 1000
const NS = 'otp:send:'

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function phoneKey(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

export type GuardDecision =
  | { allowed: true }
  | {
      allowed: false
      reason: 'cooldown' | 'window_15m' | 'window_1h' | 'daily_cap' | 'ip_cap'
      retryAfterSec: number
    }

function checkMap(
  map: Map<string, SendRecord>,
  key: string,
  nowMs: number,
  opts: {
    minIntervalMs: number
    window15mCap: number
    window1hCap: number
    dailyCap: number
    reasonPrefix?: 'ip_cap'
  },
): GuardDecision {
  if (map.size > 10_000) {
    for (const [k, r] of map) if (nowMs - r.lastSentAtMs > DAY_MS) map.delete(k)
  }

  const rec = map.get(key)
  const stamps = (rec?.stamps ?? []).filter((t) => nowMs - t < DAY_MS)

  if (rec) {
    const sinceLast = nowMs - rec.lastSentAtMs
    if (sinceLast < opts.minIntervalMs) {
      return {
        allowed: false,
        reason: opts.reasonPrefix ?? 'cooldown',
        retryAfterSec: Math.ceil((opts.minIntervalMs - sinceLast) / 1000),
      }
    }
  }

  const in15 = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).length
  if (in15 >= opts.window15mCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_15M_MS).sort((a, b) => a - b)[0]!
    return {
      allowed: false,
      reason: opts.reasonPrefix ?? 'window_15m',
      retryAfterSec: Math.ceil((oldest + WINDOW_15M_MS - nowMs) / 1000),
    }
  }

  const in1h = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).length
  if (in1h >= opts.window1hCap) {
    const oldest = stamps.filter((t) => nowMs - t < WINDOW_1H_MS).sort((a, b) => a - b)[0]!
    return {
      allowed: false,
      reason: opts.reasonPrefix ?? 'window_1h',
      retryAfterSec: Math.ceil((oldest + WINDOW_1H_MS - nowMs) / 1000),
    }
  }

  if (stamps.length >= opts.dailyCap) {
    const oldest = stamps.sort((a, b) => a - b)[0]!
    return {
      allowed: false,
      reason: opts.reasonPrefix ?? 'daily_cap',
      retryAfterSec: Math.ceil((oldest + DAY_MS - nowMs) / 1000),
    }
  }

  stamps.push(nowMs)
  map.set(key, { lastSentAtMs: nowMs, stamps })
  return { allowed: true }
}

type RedisLike = {
  set: (...args: unknown[]) => Promise<string | null>
  incr: (key: string) => Promise<number>
  expire: (key: string, sec: number) => Promise<number>
  ttl: (key: string) => Promise<number>
}

let _redis: RedisLike | null = null
let _redisFailed = false

async function getRedis(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL?.trim()
  if (!url || url.length < 10 || _redisFailed) return null
  if (_redis) return _redis
  try {
    const IORedis = (await import('ioredis')).default
    const client = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    })
    await Promise.race([
      client.connect().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ])
    _redis = client as unknown as RedisLike
    return _redis
  } catch {
    _redisFailed = true
    return null
  }
}

async function checkPhoneRedis(key: string, nowMs: number): Promise<GuardDecision | null> {
  const redis = await getRedis()
  if (!redis) return null

  const minInterval = positiveInt(process.env.OTP_SEND_MIN_INTERVAL_SEC, 60)
  const window15mCap = positiveInt(process.env.OTP_SEND_15M_CAP, 3)
  const window1hCap = positiveInt(process.env.OTP_SEND_1H_CAP, 5)
  const dailyCap = positiveInt(process.env.OTP_SEND_DAILY_CAP, 15)

  const cooldownKey = `${NS}cd:${key}`
  const w15Key = `${NS}w15:${key}`
  const w1hKey = `${NS}w1h:${key}`
  const dayKey = `${NS}day:${key}:${new Date(nowMs).toISOString().slice(0, 10)}`

  try {
    const setOk = await redis.set(cooldownKey, '1', 'EX', minInterval, 'NX')
    if (setOk === null) {
      const ttl = await redis.ttl(cooldownKey).catch(() => minInterval)
      return { allowed: false, reason: 'cooldown', retryAfterSec: ttl > 0 ? ttl : minInterval }
    }
    const w15 = await redis.incr(w15Key)
    if (w15 === 1) await redis.expire(w15Key, 15 * 60)
    if (w15 > window15mCap) {
      const ttl = await redis.ttl(w15Key).catch(() => 15 * 60)
      return { allowed: false, reason: 'window_15m', retryAfterSec: ttl > 0 ? ttl : 15 * 60 }
    }
    const w1h = await redis.incr(w1hKey)
    if (w1h === 1) await redis.expire(w1hKey, 60 * 60)
    if (w1h > window1hCap) {
      const ttl = await redis.ttl(w1hKey).catch(() => 60 * 60)
      return { allowed: false, reason: 'window_1h', retryAfterSec: ttl > 0 ? ttl : 60 * 60 }
    }
    const count = await redis.incr(dayKey)
    if (count === 1) await redis.expire(dayKey, 24 * 3600)
    if (count > dailyCap) {
      const ttl = await redis.ttl(dayKey).catch(() => 3600)
      return { allowed: false, reason: 'daily_cap', retryAfterSec: ttl > 0 ? ttl : 3600 }
    }
    return { allowed: true }
  } catch {
    return null
  }
}

export async function checkAndRecordCxOtpSend(
  phone: string,
  ip: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<GuardDecision> {
  const key = phoneKey(phone)
  if (!key) return { allowed: true }

  const minIntervalMs = positiveInt(process.env.OTP_SEND_MIN_INTERVAL_SEC, 60) * 1000
  const window15mCap = positiveInt(process.env.OTP_SEND_15M_CAP, 3)
  const window1hCap = positiveInt(process.env.OTP_SEND_1H_CAP, 5)
  const dailyCap = positiveInt(process.env.OTP_SEND_DAILY_CAP, 15)
  const ipHourlyCap = positiveInt(process.env.OTP_SEND_IP_HOURLY_CAP, 20)

  const ipKey = String(ip ?? '').trim() || 'unknown'
  const ipDecision = checkMap(ipSends, ipKey, nowMs, {
    minIntervalMs: 1000,
    window15mCap: Math.max(ipHourlyCap, window15mCap),
    window1hCap: ipHourlyCap,
    dailyCap: Math.max(ipHourlyCap * 3, dailyCap),
    reasonPrefix: 'ip_cap',
  })
  if (!ipDecision.allowed) return ipDecision

  const redisDecision = await checkPhoneRedis(key, nowMs)
  if (redisDecision) return redisDecision

  return checkMap(phoneSends, key, nowMs, {
    minIntervalMs,
    window15mCap,
    window1hCap,
    dailyCap,
  })
}
