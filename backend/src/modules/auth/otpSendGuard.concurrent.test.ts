/**
 * Concurrent rate-limit race: only one of many parallel sends for the same phone may pass cooldown.
 * Run: node --experimental-test-module-mocks --import tsx --test src/modules/auth/otpSendGuard.concurrent.test.ts
 */
import assert from "node:assert/strict";
import { test, mock, before } from "node:test";

type Entry = { v: string; exp: number };
const store = new Map<string, Entry>();
const now = () => Date.now();

const fakeRedis = {
  async set(key: string, val: string, ...args: unknown[]): Promise<string | null> {
    // Atomic SET NX (matches Redis): check+write must not interleave with awaits.
    const nx = args.includes("NX");
    const exIdx = args.indexOf("EX");
    const ttl = exIdx >= 0 ? Number(args[exIdx + 1]) : 0;
    const existing = store.get(key);
    const alive = existing != null && existing.exp > now();
    if (nx && alive) return null;
    store.set(key, { v: String(val), exp: ttl ? now() + ttl * 1000 : Number.POSITIVE_INFINITY });
    return "OK";
  },
  async ttl(key: string): Promise<number> {
    const e = store.get(key);
    if (!e) return -2;
    const s = Math.ceil((e.exp - now()) / 1000);
    return s > 0 ? s : -2;
  },
  async incr(key: string): Promise<number> {
    const e = store.get(key);
    const alive = e != null && e.exp > now();
    const n = (alive ? Number(e!.v) : 0) + 1;
    store.set(key, { v: String(n), exp: alive ? e!.exp : Number.POSITIVE_INFINITY });
    return n;
  },
  async expire(key: string, sec: number): Promise<number> {
    const e = store.get(key);
    if (e) e.exp = now() + sec * 1000;
    return 1;
  },
};

let checkAndRecordOtpSend: typeof import("./otpSendGuard.js").checkAndRecordOtpSend;

before(async () => {
  mock.module("@gatimitra/redis", {
    namedExports: { getRedis: () => fakeRedis, isRedisConfigured: () => true },
  });
  ({ checkAndRecordOtpSend } = await import("./otpSendGuard.js"));
});

test("concurrent requests for one phone: at most one allowed under cooldown", async () => {
  store.clear();
  const phone = "+919700000001";
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      checkAndRecordOtpSend(phone, {
        minIntervalSec: 60,
        window15mCap: 100,
        window1hCap: 100,
        dailyCap: 100,
      }),
    ),
  );
  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(allowed, 1, `expected exactly 1 allowed, got ${allowed}`);
});
