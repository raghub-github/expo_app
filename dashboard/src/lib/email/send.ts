/**
 * Transactional email (tickets, forwards, verification, etc.):
 * When `EMAIL_ID` + `EMAIL_APP_PASSWORD` are set in `dashboard/.env.local`, Zoho SMTP is used
 * (`smtp-config.ts`: host smtp.zoho.in by default). Otherwise falls back to Resend if `RESEND_API_KEY` is set.
 */
import { createSmtpTransporter, getSmtpConfig } from "./smtp-config";

export type SendEmailOutcome =
  | { ok: true }
  | {
      ok: false;
      code: "NOT_CONFIGURED" | "SMTP_AUTH_FAILED" | "SMTP_ERROR" | "RESEND_ERROR";
    };

function normalizeAddressList(input: string | string[] | undefined): string[] {
  if (input == null) return [];
  const parts = Array.isArray(input) ? input : String(input).split(",");
  return parts.map((s) => String(s).trim()).filter(Boolean);
}

export type OutboundEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendEmail(params: {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: OutboundEmailAttachment[];
}): Promise<SendEmailOutcome> {
  let toList = normalizeAddressList(params.to);
  let ccList = normalizeAddressList(params.cc);
  let bccList = normalizeAddressList(params.bcc);

  if (toList.length === 0 && ccList.length === 0 && bccList.length === 0) {
    console.warn("[email] sendEmail called with no recipients");
    return { ok: false, code: "SMTP_ERROR" };
  }

  /** SMTP/Resend need at least one visible `to`; promote Cc/Bcc when To is empty. */
  if (toList.length === 0 && ccList.length > 0) {
    toList = [ccList[0]];
    ccList = ccList.slice(1);
  } else if (toList.length === 0 && bccList.length > 0) {
    toList = [bccList[0]];
    bccList = bccList.slice(1);
  }

  if (toList.length === 0) {
    console.warn("[email] sendEmail could not assign a primary recipient");
    return { ok: false, code: "SMTP_ERROR" };
  }

  const cfg = getSmtpConfig();
  if (cfg.ok) {
    try {
      const transporter = await createSmtpTransporter();
      if (!transporter) return { ok: false, code: "SMTP_ERROR" };
      const fromHeader = params.from ?? `${cfg.fromName} <${cfg.fromEmail}>`;
      const mailAttachments =
        params.attachments?.map((a) => ({
          filename: a.filename || "attachment",
          content: a.content,
          contentType: a.contentType || "application/octet-stream",
        })) ?? [];

      await transporter.sendMail({
        from: fromHeader,
        to: toList.length === 1 ? toList[0] : toList,
        ...(ccList.length > 0 ? { cc: ccList.length === 1 ? ccList[0] : ccList } : {}),
        ...(bccList.length > 0 ? { bcc: bccList.length === 1 ? bccList[0] : bccList } : {}),
        replyTo: cfg.fromEmail,
        subject: params.subject,
        text: params.text,
        html: params.html ?? params.text.replace(/\n/g, "<br />"),
        ...(mailAttachments.length > 0 ? { attachments: mailAttachments } : {}),
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
      { to: toList, subject: params.subject }
    );
    return { ok: false, code: "NOT_CONFIGURED" };
  }

  try {
    const body: Record<string, unknown> = {
      from,
      to: toList.length === 1 ? toList[0] : toList,
      subject: params.subject,
      text: params.text,
    };
    if (params.html) {
      body.html = params.html;
    }
    if (ccList.length > 0) {
      body.cc = ccList;
    }
    if (bccList.length > 0) {
      body.bcc = bccList;
    }
    if (params.attachments?.length) {
      body.attachments = params.attachments.map((a) => ({
        filename: a.filename || "attachment",
        content: Buffer.from(a.content).toString("base64"),
      }));
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
