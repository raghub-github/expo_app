/** Merchant action OTP for dashboard store staff management. */

import { randomInt, randomUUID } from "crypto";
import { getRedisClient } from "@/lib/redis";

export type MerchantActionOtpPurpose =
  | "invite"
  | "remove_staff"
  | "logout_device"
  | "logout_all";

type Entry = {
  userId: string;
  purpose: MerchantActionOtpPurpose;
  otp: string;
  phoneE164: string;
  email: string | null;
  expiresAtMs: number;
  attempts: number;
};

const store = new Map<string, Entry>();
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Per-phone send budget (same defaults / Redis keys as backend otpSendGuard). */
type SendRec = { lastSentAtMs: number; stamps: number[] };
const sendGuard = new Map<string, SendRec>();
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_15M_MS = 15 * 60 * 1000;
const WINDOW_1H_MS = 60 * 60 * 1000;
const NS = "otp:send:";

function phoneKey(phone: string): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function checkMemory(phone: string): { ok: true } | { ok: false; reason: string } {
  const key = phoneKey(phone);
  if (!key) return { ok: true };
  const nowMs = Date.now();
  const minIntervalMs = positiveInt(process.env.OTP_SEND_MIN_INTERVAL_SEC, 60) * 1000;
  const window15mCap = positiveInt(process.env.OTP_SEND_15M_CAP, 3);
  const window1hCap = positiveInt(process.env.OTP_SEND_1H_CAP, 5);
  const dailyCap = positiveInt(process.env.OTP_SEND_DAILY_CAP, 15);

  const rec = sendGuard.get(key);
  const stamps = (rec?.stamps ?? []).filter((t) => nowMs - t < DAY_MS);
  if (rec && nowMs - rec.lastSentAtMs < minIntervalMs) {
    return { ok: false, reason: "cooldown" };
  }
  if (stamps.filter((t) => nowMs - t < WINDOW_15M_MS).length >= window15mCap) {
    return { ok: false, reason: "window_15m" };
  }
  if (stamps.filter((t) => nowMs - t < WINDOW_1H_MS).length >= window1hCap) {
    return { ok: false, reason: "window_1h" };
  }
  if (stamps.length >= dailyCap) return { ok: false, reason: "daily_cap" };
  stamps.push(nowMs);
  sendGuard.set(key, { lastSentAtMs: nowMs, stamps });
  return { ok: true };
}

async function checkAndRecordDashboardOtpSend(
  phone: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = phoneKey(phone);
  if (!key) return { ok: true };

  const redis = getRedisClient();
  if (!redis) return checkMemory(phone);

  const minInterval = positiveInt(process.env.OTP_SEND_MIN_INTERVAL_SEC, 60);
  const window15mCap = positiveInt(process.env.OTP_SEND_15M_CAP, 3);
  const window1hCap = positiveInt(process.env.OTP_SEND_1H_CAP, 5);
  const dailyCap = positiveInt(process.env.OTP_SEND_DAILY_CAP, 15);
  const cooldownKey = `${NS}cd:${key}`;
  const w15Key = `${NS}w15:${key}`;
  const w1hKey = `${NS}w1h:${key}`;
  const dayKey = `${NS}day:${key}:${new Date().toISOString().slice(0, 10)}`;

  try {
    if (redis.status !== "ready") await redis.connect().catch(() => undefined);
    const setOk = await redis.set(cooldownKey, "1", "EX", minInterval, "NX");
    if (setOk === null) return { ok: false, reason: "cooldown" };
    const w15 = await redis.incr(w15Key);
    if (w15 === 1) await redis.expire(w15Key, 15 * 60);
    if (w15 > window15mCap) return { ok: false, reason: "window_15m" };
    const w1h = await redis.incr(w1hKey);
    if (w1h === 1) await redis.expire(w1hKey, 60 * 60);
    if (w1h > window1hCap) return { ok: false, reason: "window_1h" };
    const count = await redis.incr(dayKey);
    if (count === 1) await redis.expire(dayKey, 24 * 3600);
    if (count > dailyCap) return { ok: false, reason: "daily_cap" };
    return { ok: true };
  } catch {
    return checkMemory(phone);
  }
}

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "**********";
  return `**********${d.slice(-4)}`;
}

function maskEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return "a*************@mail.com";
  const local = e.slice(0, at);
  const domain = e.slice(at);
  return `${local[0]}${"*".repeat(Math.max(3, local.length - 1))}${domain}`;
}

async function sendSms(mobile: string, otp: string): Promise<boolean> {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  if (!authKey) return false;
  const digits = mobile.replace(/\D/g, "");
  const mobileWithCountry =
    digits.length === 10 ? `91${digits}` : digits.startsWith("91") ? digits : `91${digits.slice(-10)}`;
  const templateId = process.env.MSG91_TEMPLATE_ID?.trim();
  const sender = process.env.MSG91_SENDER_ID || "GMMSMS";
  try {
    if (templateId) {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: authKey },
        body: JSON.stringify({
          template_id: templateId,
          sender,
          short_url: "0",
          recipients: [{ mobiles: mobileWithCountry, OTP: otp, Code: otp, VAR1: otp }],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { type?: string };
      return res.ok && data.type !== "error";
    }
    return false;
  } catch {
    return false;
  }
}

export async function sendMerchantActionOtp(args: {
  userId: string;
  purpose: MerchantActionOtpPurpose;
  phoneE164: string;
  email?: string | null;
}): Promise<{
  requestId: string;
  sentSms: boolean;
  sentEmail: boolean;
  maskedPhone: string;
  maskedEmail: string | null;
  devOtp?: string;
}> {
  const phone = args.phoneE164.trim();
  const email = args.email?.trim().toLowerCase() || null;
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    throw Object.assign(new Error("Owner phone is required to send OTP."), { statusCode: 400 });
  }
  const rate = await checkAndRecordDashboardOtpSend(phone);
  if (!rate.ok) {
    throw Object.assign(
      new Error("Too many OTP requests for this number. Please wait a bit and try again."),
      { statusCode: 429, reason: rate.reason },
    );
  }
  const otp = generateOtp();
  const requestId = randomUUID().replace(/-/g, "").slice(0, 26);
  store.set(requestId, {
    userId: args.userId,
    purpose: args.purpose,
    otp,
    phoneE164: phone,
    email,
    expiresAtMs: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });
  const sentSms = await sendSms(phone, otp);
  const isDev = process.env.NODE_ENV !== "production";
  return {
    requestId,
    sentSms,
    sentEmail: false,
    maskedPhone: maskPhone(phone),
    maskedEmail: email ? maskEmail(email) : null,
    ...(isDev || !sentSms ? { devOtp: otp } : {}),
  };
}

export function verifyMerchantActionOtp(args: {
  userId: string;
  requestId: string;
  otp: string;
  purpose?: MerchantActionOtpPurpose;
}): { ok: true } | { ok: false; reason: string } {
  const entry = store.get(args.requestId);
  if (!entry) return { ok: false, reason: "OTP expired or not found. Request a new one." };
  if (entry.userId !== args.userId) return { ok: false, reason: "OTP does not match this session." };
  if (args.purpose && entry.purpose !== args.purpose) {
    return { ok: false, reason: "OTP purpose mismatch." };
  }
  if (Date.now() > entry.expiresAtMs) {
    store.delete(args.requestId);
    return { ok: false, reason: "OTP expired." };
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(args.requestId);
    return { ok: false, reason: "Too many attempts." };
  }
  if (String(args.otp).trim() !== entry.otp) return { ok: false, reason: "Invalid OTP." };
  store.delete(args.requestId);
  return { ok: true };
}
