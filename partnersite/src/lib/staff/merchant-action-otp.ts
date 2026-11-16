/**
 * Partnersite sensitive-action OTP (invite / remove staff / logout).
 * In-memory + DB-backed so verify survives Next.js HMR / multi-worker.
 */

import { createHash, randomInt, randomUUID } from "crypto";
import { client as sql } from "@/lib/drizzle";

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

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type GlobalOtpBag = {
  __merchantActionOtpStore?: Map<string, Entry>;
  __merchantActionOtpTableReady?: Promise<void> | null;
};
const g = globalThis as unknown as GlobalOtpBag;
const memoryStore: Map<string, Entry> = g.__merchantActionOtpStore ?? new Map();
g.__merchantActionOtpStore = memoryStore;

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(String(otp).trim()).digest("hex");
}

function normalizeOtp(otp: string): string {
  return String(otp ?? "").replace(/\D/g, "").trim();
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

async function ensureTable(): Promise<void> {
  if (!g.__merchantActionOtpTableReady) {
    g.__merchantActionOtpTableReady = (async () => {
      const existing = await sql`
        SELECT to_regclass('public.merchant_action_otps') AS t
      `;
      if ((existing[0] as { t?: string | null } | undefined)?.t) return;
      await sql`
        CREATE TABLE public.merchant_action_otps (
          request_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          purpose TEXT NOT NULL,
          otp_hash TEXT NOT NULL,
          phone_e164 TEXT NOT NULL,
          email TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch((err) => {
      g.__merchantActionOtpTableReady = null;
      throw err;
    });
  }
  await g.__merchantActionOtpTableReady;
}

async function sendSmsViaMsg91(mobile: string, otp: string): Promise<boolean> {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  if (!authKey) return false;
  const templateId = process.env.MSG91_TEMPLATE_ID?.trim();
  const flowId = process.env.MSG91_FLOW_ID?.trim();
  const flowOrTemplateId = flowId || templateId;
  const otpVarName = process.env.MSG91_OTP_VAR_NAME?.trim() || "OTP";
  const sender = process.env.MSG91_SENDER_ID || "GMMSMS";
  const digits = mobile.replace(/\D/g, "");
  const mobileWithCountry =
    digits.length === 10 ? `91${digits}` : digits.startsWith("91") ? digits : `91${digits.slice(-10)}`;

  try {
    if (flowOrTemplateId) {
      const recipient: Record<string, string> = { mobiles: mobileWithCountry };
      recipient[otpVarName] = otp;
      recipient.OTP = otp;
      recipient.Code = otp;
      if (otpVarName !== "VAR1") recipient.VAR1 = otp;
      const payload: Record<string, unknown> = {
        sender,
        short_url: "0",
        recipients: [recipient],
      };
      if (templateId) payload.template_id = templateId;
      else if (flowId) payload.flow_id = flowId;
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: authKey },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { type?: string };
      return res.ok && data.type !== "error";
    }
    const template =
      process.env.MSG91_OTP_TEMPLATE_CONTENT?.trim() ||
      "Dear User, your OTP for Gatimitra account verification is ##OTP##. It is valid for 10 minutes. Do not share it with anyone.";
    const message = template.replace(/##OTP##/g, otp);
    const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify({
        sender,
        route: "4",
        country: "91",
        sms: [{ message, to: [mobileWithCountry] }],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { type?: string };
    return res.ok && data.type !== "error";
  } catch {
    return false;
  }
}

async function sendOtpEmail(email: string, otp: string, purpose: MerchantActionOtpPurpose): Promise<boolean> {
  try {
    const { createPartnerMailTransport, getPartnerSmtpConfig } = await import("@/lib/email/partner-smtp");
    const cfg = getPartnerSmtpConfig();
    if (!cfg) return false;
    const transporter = await createPartnerMailTransport(cfg);
    const subject =
      purpose === "invite"
        ? "GatiMitra — confirm staff invite"
        : purpose === "remove_staff"
          ? "GatiMitra — confirm staff removal"
          : "GatiMitra — verify device logout";
    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: email,
      subject,
      text: `Your verification code is ${otp}. It expires in 5 minutes. Do not share it.`,
      html: `<p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes. Do not share it.</p>`,
    });
    return true;
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
  expiresInSec: number;
}> {
  const phone = args.phoneE164.trim();
  const email = args.email?.trim().toLowerCase() || null;
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    throw Object.assign(new Error("Owner phone is required to send OTP."), { statusCode: 400 });
  }

  const otp = generateOtp();
  const requestId = randomUUID().replace(/-/g, "").slice(0, 26);
  const expiresAtMs = Date.now() + OTP_EXPIRY_MS;
  const entry: Entry = {
    userId: args.userId,
    purpose: args.purpose,
    otp,
    phoneE164: phone,
    email,
    expiresAtMs,
    attempts: 0,
  };
  memoryStore.set(requestId, entry);

  try {
    await ensureTable();
    await sql`
      INSERT INTO public.merchant_action_otps (
        request_id, user_id, purpose, otp_hash, phone_e164, email, attempts, expires_at
      )
      VALUES (
        ${requestId},
        ${args.userId},
        ${args.purpose},
        ${hashOtp(otp)},
        ${phone},
        ${email},
        0,
        ${new Date(expiresAtMs).toISOString()}
      )
      ON CONFLICT (request_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        purpose = EXCLUDED.purpose,
        otp_hash = EXCLUDED.otp_hash,
        phone_e164 = EXCLUDED.phone_e164,
        email = EXCLUDED.email,
        attempts = 0,
        expires_at = EXCLUDED.expires_at
    `;
  } catch (e) {
    console.error("[merchant-action-otp] persist failed", e);
  }

  const sentSms = await sendSmsViaMsg91(phone, otp);
  const sentEmail = email ? await sendOtpEmail(email, otp, args.purpose) : false;
  const isDev = process.env.NODE_ENV !== "production";

  if (!sentSms && !sentEmail && !isDev) {
    memoryStore.delete(requestId);
    try {
      await sql`DELETE FROM public.merchant_action_otps WHERE request_id = ${requestId}`;
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error("Could not send OTP to phone or email. Try again."), {
      statusCode: 502,
    });
  }

  return {
    requestId,
    sentSms: sentSms || isDev,
    sentEmail: sentEmail || (isDev && !!email),
    maskedPhone: maskPhone(phone),
    maskedEmail: email ? maskEmail(email) : null,
    expiresInSec: Math.round(OTP_EXPIRY_MS / 1000),
  };
}

export async function verifyMerchantActionOtp(args: {
  userId: string;
  requestId: string;
  otp: string;
  purpose?: MerchantActionOtpPurpose;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const requestId = String(args.requestId ?? "").trim();
  const otp = normalizeOtp(args.otp);
  if (!requestId || otp.length < 4) {
    return { ok: false, reason: "Invalid OTP payload." };
  }

  let entry = memoryStore.get(requestId) ?? null;

  if (!entry) {
    try {
      await ensureTable();
      const rows = await sql`
        SELECT user_id, purpose, otp_hash, phone_e164, email, attempts, expires_at
        FROM public.merchant_action_otps
        WHERE request_id = ${requestId}
        LIMIT 1
      `;
      const row = rows[0] as
        | {
            user_id: string;
            purpose: string;
            otp_hash: string;
            phone_e164: string;
            email: string | null;
            attempts: number;
            expires_at: string | Date;
          }
        | undefined;
      if (row) {
        entry = {
          userId: String(row.user_id),
          purpose: String(row.purpose) as MerchantActionOtpPurpose,
          otp: "", // compare via hash only for DB-backed entries
          phoneE164: String(row.phone_e164),
          email: row.email ? String(row.email) : null,
          expiresAtMs: new Date(row.expires_at).getTime(),
          attempts: Number(row.attempts ?? 0),
        };
        (entry as Entry & { otpHash?: string }).otpHash = String(row.otp_hash);
      }
    } catch (e) {
      console.error("[merchant-action-otp] load failed", e);
    }
  }

  if (!entry) return { ok: false, reason: "OTP expired or not found. Request a new one." };
  if (entry.userId !== args.userId) return { ok: false, reason: "OTP does not match this session." };
  if (args.purpose && entry.purpose !== args.purpose) {
    return { ok: false, reason: "OTP purpose mismatch. Request a new one." };
  }
  if (Date.now() > entry.expiresAtMs) {
    memoryStore.delete(requestId);
    try {
      await sql`DELETE FROM public.merchant_action_otps WHERE request_id = ${requestId}`;
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "OTP expired. Request a new one." };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    memoryStore.delete(requestId);
    try {
      await sql`DELETE FROM public.merchant_action_otps WHERE request_id = ${requestId}`;
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "Too many attempts. Request a new OTP." };
  }

  const otpHash = (entry as Entry & { otpHash?: string }).otpHash;
  const matches = otpHash
    ? hashOtp(otp) === otpHash
    : otp === String(entry.otp).trim();

  try {
    await sql`
      UPDATE public.merchant_action_otps
      SET attempts = ${entry.attempts}
      WHERE request_id = ${requestId}
    `;
  } catch {
    /* memory-only fallback still works */
  }

  if (!matches) {
    memoryStore.set(requestId, entry);
    return { ok: false, reason: "Invalid OTP." };
  }

  memoryStore.delete(requestId);
  try {
    await sql`DELETE FROM public.merchant_action_otps WHERE request_id = ${requestId}`;
  } catch {
    /* ignore */
  }
  return { ok: true };
}
