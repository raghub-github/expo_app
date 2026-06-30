/**
 * Zoho / SMTP — same env aliases as dashboard `src/lib/email/smtp-config.ts`.
 * Env: EMAIL_ID, EMAIL_APP_PASSWORD, optional SMTP_HOST (default smtp.zoho.in), SMTP_PORT, SMTP_SECURE, SMTP_FROM_*
 */
export type SmtpConfig =
  | { ok: true; user: string; pass: string; host: string; port: number; secure: boolean; fromEmail: string; fromName: string }
  | { ok: false };

export function getSmtpConfig(): SmtpConfig {
  const user = process.env.EMAIL_ID || process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL;
  const pass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.zoho.in";
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpSecureEnv = process.env.SMTP_SECURE;
  const smtpSecure =
    smtpSecureEnv != null && String(smtpSecureEnv).trim() !== ""
      ? String(smtpSecureEnv).toLowerCase() !== "false"
      : smtpPort === 465;
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "GatiMitra Team";

  if (!user?.trim() || !pass?.trim() || !fromEmail?.trim()) {
    return { ok: false };
  }

  return {
    ok: true,
    user: user.trim(),
    pass: pass.trim(),
    host: smtpHost.trim(),
    port: smtpPort,
    secure: smtpSecure,
    fromEmail: fromEmail.trim(),
    fromName: fromName.trim(),
  };
}

export async function createSmtpTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.ok) return null;
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure && cfg.port === 587,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
  });
}

export function formatSmtpFrom(overrides?: { fromName?: string }): string | null {
  const cfg = getSmtpConfig();
  if (!cfg.ok) return null;
  const fromName = overrides?.fromName?.trim() || cfg.fromName;
  return `"${fromName}" <${cfg.fromEmail}>`;
}

/** Ride invoice emails use a dedicated sender display name. */
export function formatRideInvoiceSmtpFrom(): string | null {
  const rideFromName =
    process.env.RIDE_INVOICE_FROM_NAME?.trim() ||
    process.env.SMTP_RIDE_FROM_NAME?.trim() ||
    "GatiMitra - Ride - Services";
  return formatSmtpFrom({ fromName: rideFromName });
}
