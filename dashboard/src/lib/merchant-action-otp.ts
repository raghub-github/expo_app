/** In-memory merchant action OTP for dashboard store staff management. */

import { randomInt, randomUUID } from "crypto";

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
