/**
 * Shared Zoho/SMTP helpers for partner registration emails.
 */

export type PartnerSmtpConfig = {
  smtpUser: string;
  smtpPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
};

export function getPartnerSmtpConfig(): PartnerSmtpConfig | null {
  const smtpUser = process.env.EMAIL_ID || process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL;
  const smtpPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.zoho.in";
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpSecureEnv = process.env.SMTP_SECURE;
  const smtpSecure =
    smtpSecureEnv != null && String(smtpSecureEnv).trim() !== ""
      ? String(smtpSecureEnv).toLowerCase() !== "false"
      : smtpPort === 465;
  const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
  const fromName = process.env.SMTP_FROM_NAME || "GatiMitra Team";

  if (!smtpUser || !smtpPass || !fromEmail) return null;
  return { smtpUser, smtpPass, smtpHost, smtpPort, smtpSecure, fromEmail, fromName };
}

export async function createPartnerMailTransport(cfg: PartnerSmtpConfig) {
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    requireTLS: !cfg.smtpSecure && cfg.smtpPort === 587,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
  });
}

/** Email when a parent (partner) account is created successfully. */
export async function sendParentAccountCreatedEmail(args: {
  ownerName: string | null;
  ownerEmail: string;
  parentName: string | null;
  parentMerchantId: string | null;
  parentId?: number | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const { ownerName, ownerEmail, parentName, parentMerchantId, parentId } = args;
  const to = (ownerEmail || "").trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { sent: false, reason: "missing_email" };
  }

  const cfg = getPartnerSmtpConfig();
  if (!cfg) {
    console.warn("[auth/register] Email env not configured; skipping parent welcome email");
    return { sent: false, reason: "smtp_not_configured" };
  }

  const safeName = (ownerName || "").toString().trim() || "Partner";
  const safeParent = (parentName || "").toString().trim() || "your business";
  const safePid = (parentMerchantId || "").toString().trim();
  const continueUrl =
    parentId != null
      ? `https://partner.gatimitra.com/auth/register-store?parent_id=${encodeURIComponent(String(parentId))}&new=1`
      : "https://partner.gatimitra.com/auth/register-store?new=1";

  const textBody = [
    `Hi ${safeName},`,
    "",
    "Your GatiMitra Partner (parent) account has been created successfully.",
    `Business: ${safeParent}`,
    safePid ? `Parent ID: ${safePid}` : null,
    "",
    "Next step: add your first store (outlet) to start receiving orders.",
    `Continue: ${continueUrl}`,
    "",
    "Need help? support@gatimitra.com",
    "",
    "Regards,",
    "Team GatiMitra",
  ]
    .filter(Boolean)
    .join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Partner account created - GatiMitra</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#ea580c,#f97316);padding:28px 24px;color:#fff;">
              <p style="margin:0;font-size:13px;opacity:0.9;letter-spacing:0.04em;text-transform:uppercase;">GatiMitra Partner</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">Partner account created</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;color:#0f172a;">
              <p style="margin:0 0 12px;font-size:15px;">Hi <strong>${escapeHtml(safeName)}</strong>,</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
                Your GatiMitra Partner account for <strong>${escapeHtml(safeParent)}</strong> is ready.
              </p>
              ${
                safePid
                  ? `<p style="margin:0 0 16px;font-size:14px;color:#475569;">Parent ID: <strong style="font-family:ui-monospace,monospace;">${escapeHtml(safePid)}</strong></p>`
                  : ""
              }
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155;">
                Next, add your first store (outlet) so you can complete verification and go live.
              </p>
              <a href="${continueUrl}" style="display:inline-block;background:#ea580c;color:#fff;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">
                Add your first store →
              </a>
              <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                Need help? <a href="mailto:support@gatimitra.com" style="color:#ea580c;">support@gatimitra.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;">
              Team GatiMitra
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const transporter = await createPartnerMailTransport(cfg);
    await transporter.sendMail({
      from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
      to,
      replyTo: cfg.fromEmail,
      subject: `Partner account created - GatiMitra (${safeParent})`,
      text: textBody,
      html: htmlBody,
    });
    console.log("[auth/register] Sent parent welcome email to", to);
    return { sent: true };
  } catch (err) {
    console.error("[auth/register] Parent welcome email failed:", err);
    return { sent: false, reason: "send_failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
