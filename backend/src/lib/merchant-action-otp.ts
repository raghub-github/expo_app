/**
 * Merchant sensitive-action OTP (invite / remove staff / logout / self-revoke).
 * Same MSG91 push path for owner and staff: prefer channels that actually deliver SMS,
 * plus owner email when available (invite/remove/logout).
 */

import { ulid } from "ulid";
import { getEnv } from "../config/env.js";
import { deliverSupabaseOtpViaMsg91 } from "../services/otp/msg91DeliverSupabaseOtp.js";
import { createSmtpTransporter, formatSmtpFrom, getSmtpConfig } from "./smtp-config.js";
import {
  buildMerchantActionOtpMessage,
  type MerchantActionOtpPurpose,
} from "../services/email/merchantActionOtpTemplate.js";

export type MerchantActionPurpose = MerchantActionOtpPurpose;

type ActionOtpEntry = {
  userId: string;
  purpose: MerchantActionPurpose;
  otp: string;
  phoneE164: string;
  email: string | null;
  expiresAtMs: number;
  attempts: number;
};

const store = new Map<string, ActionOtpEntry>();
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

async function sendOtpEmail(email: string, otp: string, purpose: MerchantActionPurpose): Promise<boolean> {
  const cfg = getSmtpConfig();
  if (!cfg.ok) return false;
  const from = formatSmtpFrom();
  if (!from) return false;
  try {
    const transporter = await createSmtpTransporter();
    if (!transporter) return false;
    const { subject, text, html } = buildMerchantActionOtpMessage(otp, purpose);
    await transporter.sendMail({ from, to: email, subject, text, html });
    return true;
  } catch {
    return false;
  }
}

export async function sendMerchantActionOtp(args: {
  userId: string;
  purpose: MerchantActionPurpose;
  phoneE164: string;
  email?: string | null;
  log?: { info?: (o: unknown, m?: string) => void; warn?: (o: unknown, m?: string) => void };
}): Promise<{
  requestId: string;
  sentSms: boolean;
  sentEmail: boolean;
  maskedPhone: string;
  maskedEmail: string | null;
  /** Non-production only — MSG91 often returns success without delivering SMS. */
  devOtp?: string;
}> {
  const phone = args.phoneE164.trim();
  const email = args.email?.trim().toLowerCase() || null;
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    throw Object.assign(new Error("Phone is required to send OTP."), { statusCode: 400 });
  }

  const otp = generateOtp();
  const requestId = ulid();
  store.set(requestId, {
    userId: args.userId,
    purpose: args.purpose,
    otp,
    phoneE164: phone,
    email,
    expiresAtMs: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });

  const env = getEnv();
  const isDev = env.NODE_ENV !== "production";
  let sentSms = false;
  let smsChannel: string | undefined;
  try {
    // Fire every MSG91 channel — v5/v2 often return type:"success" with no SMS.
    const sms = await deliverSupabaseOtpViaMsg91(env, phone, otp, {
      tryAllChannels: true,
    });
    sentSms = !!sms.ok;
    smsChannel = sms.ok ? sms.channel : undefined;
    if (!sms.ok) {
      args.log?.warn?.(
        { err: sms.error, attempts: sms.attempts, phoneTail: phone.slice(-4) },
        "merchant action OTP SMS failed"
      );
    } else {
      args.log?.info?.(
        { channel: smsChannel, purpose: args.purpose, phoneTail: phone.slice(-4) },
        "merchant action OTP SMS sent"
      );
    }
  } catch (e) {
    args.log?.warn?.(
      { err: e instanceof Error ? e.message : String(e) },
      "merchant action OTP SMS threw"
    );
  }

  let sentEmail = false;
  if (email) {
    sentEmail = await sendOtpEmail(email, otp, args.purpose);
    if (!sentEmail) {
      args.log?.warn?.({ email }, "merchant action OTP email failed");
    }
  }

  if (isDev) {
    // Always surface OTP locally — MSG91 false-success is common in this env.
    // eslint-disable-next-line no-console
    console.warn(
      `\n  [merchant-action-otp] purpose=${args.purpose} phoneTail=${phone.slice(-4)} OTP=${otp}\n`
    );
    args.log?.info?.(
      { requestId, otp, purpose: args.purpose, phoneTail: phone.slice(-4), sentSms, sentEmail },
      "merchant action OTP (dev — use this code if SMS missing)"
    );
  }

  if (!sentSms && !sentEmail) {
    if (isDev) {
      return {
        requestId,
        sentSms: true,
        sentEmail: !!email,
        maskedPhone: maskPhone(phone),
        maskedEmail: email ? maskEmail(email) : null,
        devOtp: otp,
      };
    }
    store.delete(requestId);
    throw Object.assign(new Error("Could not send OTP to phone or email. Try again."), {
      statusCode: 502,
    });
  }

  return {
    requestId,
    sentSms,
    sentEmail,
    maskedPhone: maskPhone(phone),
    maskedEmail: email ? maskEmail(email) : null,
    ...(isDev ? { devOtp: otp } : {}),
  };
}

export function verifyMerchantActionOtp(args: {
  userId: string;
  requestId: string;
  otp: string;
  purpose?: MerchantActionPurpose;
}): { ok: true } | { ok: false; reason: string } {
  const entry = store.get(args.requestId);
  if (!entry || entry.userId !== args.userId) {
    return { ok: false, reason: "OTP expired or invalid. Request a new code." };
  }
  if (args.purpose && entry.purpose !== args.purpose) {
    return { ok: false, reason: "OTP purpose mismatch. Request a new code." };
  }
  if (Date.now() > entry.expiresAtMs) {
    store.delete(args.requestId);
    return { ok: false, reason: "OTP expired. Request a new code." };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(args.requestId);
    return { ok: false, reason: "Too many attempts. Request a new OTP." };
  }
  entry.attempts += 1;
  if (entry.otp !== args.otp.trim()) {
    return { ok: false, reason: "Invalid OTP. Please try again." };
  }
  store.delete(args.requestId);
  return { ok: true };
}
