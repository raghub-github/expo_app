import { createSmtpTransporter, formatSmtpFrom, getSmtpConfig } from "../../lib/smtp-config.js";
import { buildEmailVerificationMessage } from "./emailVerificationTemplate.js";

type EmailOtpEntry = {
  email: string;
  otp: string;
  expiresAtMs: number;
  attempts: number;
};

type DeliveryMode = "supabase" | "local";

const emailOtpStore = new Map<string, EmailOtpEntry>();
const deliveryModeStore = new Map<string, DeliveryMode>();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function trySupabaseEmailOtp(email: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return false;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, create_user: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function trySupabaseEmailVerify(email: string, token: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return false;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, token, type: "email" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildVerificationEmail(otp: string) {
  const subject = "Your GatiMitra email verification code";
  const text = [
    "Verify your email on GatiMitra",
    "",
    `Your verification code is: ${otp}`,
    "",
    "This code expires in 5 minutes.",
    "If you did not request this, you can ignore this email.",
    "",
    "Team GatiMitra",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="font-size:16px;color:#111827;margin:0 0 16px;">Verify your email on GatiMitra</p>
      <p style="font-size:14px;color:#4B5563;margin:0 0 8px;">Your verification code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#22C55E;margin:0 0 16px;">${otp}</p>
      <p style="font-size:13px;color:#6B7280;margin:0;">This code expires in 5 minutes.</p>
      <p style="font-size:12px;color:#9CA3AF;margin:24px 0 0;">If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();
  return { subject, text, html };
}

async function trySendOtpViaSmtp(
  email: string,
  otp: string,
  log?: { warn?: (obj: unknown, msg?: string) => void },
): Promise<boolean> {
  const cfg = getSmtpConfig();
  if (!cfg.ok) return false;

  const from = formatSmtpFrom();
  if (!from) return false;

  try {
    const transporter = await createSmtpTransporter();
    if (!transporter) return false;

    const { subject, text, html } = buildEmailVerificationMessage(otp);
    await transporter.sendMail({ from, to: email, subject, text, html });
    return true;
  } catch (err) {
    log?.warn?.(
      { email, host: cfg.host, port: cfg.port, err: err instanceof Error ? err.message : String(err) },
      "SMTP email verification OTP send failed",
    );
    return false;
  }
}

export async function sendCustomerEmailVerificationOtp(args: {
  customerKey: string;
  email: string;
  log?: { info?: (obj: unknown, msg?: string) => void; warn?: (obj: unknown, msg?: string) => void };
}): Promise<{ sent: boolean; viaSupabase: boolean; error?: string }> {
  const emailNorm = args.email.trim().toLowerCase();
  const otp = generateOtp();

  emailOtpStore.set(args.customerKey, {
    email: emailNorm,
    otp,
    expiresAtMs: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });
  deliveryModeStore.set(args.customerKey, "local");

  const smtpConfigured = getSmtpConfig().ok;
  if (smtpConfigured) {
    const smtpSent = await trySendOtpViaSmtp(emailNorm, otp, args.log);
    if (smtpSent) {
      return { sent: true, viaSupabase: false };
    }
  }

  const viaSupabase = await trySupabaseEmailOtp(emailNorm);
  if (viaSupabase) {
    deliveryModeStore.set(args.customerKey, "supabase");
    emailOtpStore.delete(args.customerKey);
    return { sent: true, viaSupabase: true };
  }

  if (process.env.NODE_ENV !== "production") {
    args.log?.info?.({ email: emailNorm, otp }, "email verification OTP (dev — check backend logs)");
    return { sent: true, viaSupabase: false };
  }

  emailOtpStore.delete(args.customerKey);
  deliveryModeStore.delete(args.customerKey);
  args.log?.warn?.({ email: emailNorm }, "email verification OTP delivery failed");
  return {
    sent: false,
    viaSupabase: false,
    error: "Could not send verification email. Configure Zoho SMTP (EMAIL_ID / EMAIL_APP_PASSWORD) on the server.",
  };
}

export async function verifyCustomerEmailVerificationOtp(args: {
  customerKey: string;
  email: string;
  code: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const emailNorm = args.email.trim().toLowerCase();
  const code = args.code.trim();
  const mode = deliveryModeStore.get(args.customerKey);

  if (mode === "supabase") {
    const supabaseOk = await trySupabaseEmailVerify(emailNorm, code);
    if (supabaseOk) {
      deliveryModeStore.delete(args.customerKey);
      return { ok: true };
    }
    return { ok: false, reason: "Invalid OTP. Request a new code." };
  }

  const entry = emailOtpStore.get(args.customerKey);
  if (!entry) {
    return { ok: false, reason: "No OTP pending. Tap Send code again." };
  }
  if (entry.email !== emailNorm) {
    return { ok: false, reason: "Email mismatch. Use the email on your profile." };
  }
  if (Date.now() > entry.expiresAtMs) {
    emailOtpStore.delete(args.customerKey);
    deliveryModeStore.delete(args.customerKey);
    return { ok: false, reason: "OTP expired. Request a new code." };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    emailOtpStore.delete(args.customerKey);
    deliveryModeStore.delete(args.customerKey);
    return { ok: false, reason: "Too many attempts. Request a new OTP." };
  }
  entry.attempts += 1;
  if (entry.otp !== code) {
    return { ok: false, reason: "Invalid OTP. Please try again." };
  }

  emailOtpStore.delete(args.customerKey);
  deliveryModeStore.delete(args.customerKey);
  return { ok: true };
}
