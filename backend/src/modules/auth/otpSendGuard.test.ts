import assert from "node:assert/strict";
import { test, mock, before } from "node:test";

/**
 * Per-phone OTP send guard — the anti-SMS-bomb / anti-billing-runaway limit. Tested against a
 * tiny in-memory Redis fake so the cooldown + daily-cap + per-number isolation are pinned.
 * Run needs `--experimental-test-module-mocks` (see package.json "test").
 */

type Entry = { v: string; exp: number };
const store = new Map<string, Entry>();
const now = () => Date.now();

const fakeRedis = {
  async set(key: string, val: string, ...args: unknown[]): Promise<string | null> {
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

test("cooldown blocks a second send within the interval", async () => {
  store.clear();
  const r1 = await checkAndRecordOtpSend("+919113194305", { minIntervalSec: 45, dailyCap: 100 });
  assert.equal(r1.allowed, true);
  const r2 = await checkAndRecordOtpSend("+919113194305", { minIntervalSec: 45, dailyCap: 100 });
  assert.equal(r2.allowed, false);
  assert.equal(r2.allowed === false && r2.reason, "cooldown");
});

test("daily cap blocks after N sends", async () => {
  store.clear();
  for (let i = 0; i < 3; i++) {
    const r = await checkAndRecordOtpSend("+919999999999", { minIntervalSec: 1, dailyCap: 3 });
    assert.equal(r.allowed, true, `send ${i} should pass`);
    store.delete("otp:send:cd:9999999999"); // clear cooldown so we reach the daily cap
  }
  const over = await checkAndRecordOtpSend("+919999999999", { minIntervalSec: 1, dailyCap: 3 });
  assert.equal(over.allowed, false);
  assert.equal(over.allowed === false && over.reason, "daily_cap");
});

test("different numbers are limited independently", async () => {
  store.clear();
  const a = await checkAndRecordOtpSend("+919111111111", { minIntervalSec: 45, dailyCap: 100 });
  const b = await checkAndRecordOtpSend("+919222222222", { minIntervalSec: 45, dailyCap: 100 });
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
});

test("+91 / bare variants of the same number share one limit", async () => {
  store.clear();
  const a = await checkAndRecordOtpSend("+919113194305", { minIntervalSec: 45, dailyCap: 100 });
  const b = await checkAndRecordOtpSend("9113194305", { minIntervalSec: 45, dailyCap: 100 });
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, false); // same last-10 digits → same cooldown key
});
