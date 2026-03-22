/**
 * Transactional email: prefers Zoho/SMTP (same env as partnersite) when configured;
 * otherwise Resend. Set SMTP_* / EMAIL_* in dashboard/.env.local (not only partnersite).
 */
import { createSmtpTransporter, getSmtpConfig } from "./smtp-config";

export type SendEmailOutcome =
  | { ok: true }
  | {
      ok: false;
      code: "NOT_CONFIGURED" | "SMTP_AUTH_FAILED" | "SMTP_ERROR" | "RESEND_ERROR";
    };

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}): Promise<SendEmailOutcome> {
  const cfg = getSmtpConfig();
  if (cfg.ok) {
    try {
      const transporter = await createSmtpTransporter();
      if (!transporter) return { ok: false, code: "SMTP_ERROR" };
      const fromHeader = params.from ?? `${cfg.fromName} <${cfg.fromEmail}>`;
      await transporter.sendMail({
        from: fromHeader,
        to: params.to,
        replyTo: cfg.fromEmail,
        subject: params.subject,
        text: params.text,
        html: params.html ?? params.text.replace(/\n/g, "<br />"),
      });
      return { ok: true };
    } catch (e: unknown) {
      const err = e as { code?: string; response?: string; message?: string };
      if (err.code === "EAUTH") {
        console.error(
          "[email] Zoho SMTP rejected login (535). Same fix as partnersite: Zoho Mail → Security → App Password; EMAIL_ID=full address. Default host is smtp.zoho.in (set SMTP_HOST if your Zoho doc says otherwise).",
          err.response || err.message
        );
        return { ok: false, code: "SMTP_AUTH_FAILED" };
      }
      console.error("[email] SMTP send failed:", e);
      return { ok: false, code: "SMTP_ERROR" };
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    params.from ??
    process.env.RESEND_FROM_EMAIL?.trim() ??
    "GatiMitra <noreply@gatimitra.com>";

  if (!apiKey) {
    console.warn(
      "[email] No SMTP (EMAIL_ID + EMAIL_APP_PASSWORD) or RESEND_API_KEY in dashboard env; skipping send.",
      { to: params.to, subject: params.subject }
    );
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  try {
    const body: Record<string, unknown> = {
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
    };
    if (params.html) {
      body.html = params.html;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", res.status, err);
      return { ok: false, code: "RESEND_ERROR" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Send failed:", e);
    return { ok: false, code: "RESEND_ERROR" };
  }
}
