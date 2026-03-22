/**
 * Zoho / SMTP — same logic as partnersite `register-store` welcome email (route.ts).
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
  // Identical options to partnersite register-store nodemailer.createTransport
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
