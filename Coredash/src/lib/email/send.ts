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
}): Promise<SendEmailOutcome> {
  const to = params.to.trim();
  if (!to) return { ok: false, code: "SMTP_ERROR" };

  const cfg = getSmtpConfig();
  if (cfg.ok) {
    try {
      const transporter = await createSmtpTransporter();
      if (!transporter) return { ok: false, code: "SMTP_ERROR" };
      await transporter.sendMail({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to,
        replyTo: cfg.fromEmail,
        subject: params.subject,
        text: params.text,
        html: params.html ?? params.text.replace(/\n/g, "<br />"),
      });
      return { ok: true };
    } catch (e: unknown) {
      const err = e as { code?: string; response?: string; message?: string };
      if (err.code === "EAUTH") {
        console.error("[coredash:email] SMTP auth failed", err.response || err.message);
        return { ok: false, code: "SMTP_AUTH_FAILED" };
      }
      console.error("[coredash:email] SMTP send failed:", e);
      return { ok: false, code: "SMTP_ERROR" };
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ?? "GatiMitra <noreply@gatimitra.com>";
  if (!apiKey) {
    console.warn("[coredash:email] No SMTP or RESEND_API_KEY configured");
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    if (!res.ok) {
      console.error("[coredash:email] Resend error:", res.status, await res.text());
      return { ok: false, code: "RESEND_ERROR" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[coredash:email] Resend failed:", e);
    return { ok: false, code: "RESEND_ERROR" };
  }
}
