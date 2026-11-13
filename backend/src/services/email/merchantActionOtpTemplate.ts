export type MerchantActionOtpPurpose =
  | "invite"
  | "remove_staff"
  | "logout_device"
  | "logout_all"
  | "self_revoke";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatOtpDigits(otp: string): string {
  return escapeHtml(otp.split("").join(" "));
}

type PurposeCopy = {
  subject: string;
  badge: string;
  headline: string;
  intro: string;
  actionLine: string;
  detail: string;
};

function purposeCopy(purpose: MerchantActionOtpPurpose): PurposeCopy {
  switch (purpose) {
    case "invite":
      return {
        subject: "GatiMitra — Invite team member confirmation code",
        badge: "Invite confirmation",
        headline: "Confirm team invite",
        intro:
          "You requested to invite a team member to your GatiMitra outlet. Use this code to confirm the invite.",
        actionLine: "This code is for inviting a team member",
        detail:
          "Enter this code in the merchant app to send the invite. If you did not start an invite, ignore this email.",
      };
    case "remove_staff":
      return {
        subject: "GatiMitra — Remove team member confirmation code",
        badge: "Remove user confirmation",
        headline: "Confirm user removal",
        intro:
          "You requested to permanently remove a team member from your outlet. Use this code to confirm removal.",
        actionLine: "This code is for removing a team member",
        detail:
          "Enter this code in the merchant app to complete removal. If you did not request this, ignore this email.",
      };
    case "logout_device":
      return {
        subject: "GatiMitra — Logout device confirmation code",
        badge: "Logout device confirmation",
        headline: "Confirm device logout",
        intro:
          "You requested to log out one signed-in device on your GatiMitra account. Use this code to confirm.",
        actionLine: "This code is for logging out a device",
        detail:
          "Enter this code in the merchant app to log out that device. If you did not request this, ignore this email.",
      };
    case "logout_all":
      return {
        subject: "GatiMitra — Logout all devices confirmation code",
        badge: "Logout all confirmation",
        headline: "Confirm logout from all devices",
        intro:
          "You requested to log out from all devices (including Partner Dashboard). Use this code to confirm.",
        actionLine: "This code is for logging out all devices",
        detail:
          "Enter this code in the merchant app to sign out everywhere. If you did not request this, ignore this email.",
      };
    case "self_revoke":
      return {
        subject: "GatiMitra — Revoke staff access confirmation code",
        badge: "Revoke access confirmation",
        headline: "Confirm revoke staff access",
        intro:
          "You requested to permanently remove your staff access from this outlet. Use this code to confirm.",
        actionLine: "This code is for revoking your staff access",
        detail:
          "Enter this code in the merchant app to remove yourself from the staff list. If you did not request this, ignore this email.",
      };
    default:
      return {
        subject: "GatiMitra — Security confirmation code",
        badge: "Security confirmation",
        headline: "Confirm this action",
        intro: "Use the code below to confirm a sensitive action on your GatiMitra merchant account.",
        actionLine: "This code is for a security confirmation",
        detail: "If you did not request this, ignore this email.",
      };
  }
}

export function buildMerchantActionOtpMessage(
  otp: string,
  purpose: MerchantActionOtpPurpose
): { subject: string; text: string; html: string } {
  const copy = purposeCopy(purpose);
  const year = new Date().getFullYear();

  const text = [
    "GatiMitra — Security confirmation",
    "",
    copy.actionLine,
    "",
    copy.intro,
    "",
    `Confirmation code: ${otp}`,
    "",
    "This code expires in 5 minutes.",
    "Do not share this code with anyone.",
    "",
    copy.detail,
    "",
    "Team GatiMitra",
    "support@gatimitra.com",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(copy.subject)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body, table, td, p, a { margin:0; padding:0; }
    table { border-collapse:collapse; }
    @media only screen and (max-width: 620px) {
      .wrapper { width:100% !important; }
      .content { padding:24px 20px !important; }
      .otp-digit { font-size:28px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:32px 16px;">
    <tr>
      <td align="center">
        <table class="wrapper" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#16a34a 0%,#22c55e 55%,#059669 100%); border-radius:18px 18px 0 0; padding:28px 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block; background:rgba(255,255,255,0.95); border-radius:999px; padding:8px 16px;">
                      <span style="font-size:15px; font-weight:800; color:#0f172a;">Gati<span style="color:#16a34a;">Mitra</span></span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:18px;">
                    <p style="margin:0 0 8px; display:inline-block; background:rgba(255,255,255,0.18); color:#ffffff; font-size:11px; font-weight:700; letter-spacing:0.7px; text-transform:uppercase; padding:6px 10px; border-radius:999px;">
                      ${escapeHtml(copy.badge)}
                    </p>
                    <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.3px;">${escapeHtml(copy.headline)}</h1>
                    <p style="margin:8px 0 0; color:rgba(255,255,255,0.92); font-size:14px; line-height:1.6;">${escapeHtml(copy.intro)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="content" style="background:#ffffff; padding:32px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; font-size:13px; line-height:1.55; color:#1e3a8a;">
                      <strong style="color:#1e40af;">Action:</strong> ${escapeHtml(copy.actionLine)}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px; font-size:13px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:#6b7280;">Confirmation code</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center" style="background:#f0fdf4; border:2px dashed #86efac; border-radius:16px; padding:22px 16px;">
                    <span class="otp-digit" style="font-size:36px; font-weight:800; letter-spacing:10px; color:#15803d; font-family:'Courier New',Courier,monospace;">${formatOtpDigits(otp)}</span>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0; font-size:13px; line-height:1.55; color:#92400e;">
                      <strong style="color:#78350f;">Expires in 5 minutes.</strong>
                      ${escapeHtml(copy.detail)}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0; font-size:13px; line-height:1.65; color:#6b7280;">
                For your security, never share this code with anyone — including GatiMitra support.
                The same code was also sent to your registered phone number.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 18px 18px; padding:20px 32px 28px;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">
                If you did not request this email, you can safely ignore it.<br />
                Need help? Contact us at <a href="mailto:support@gatimitra.com" style="color:#16a34a; font-weight:600;">support@gatimitra.com</a>
              </p>
              <p style="margin:14px 0 0; font-size:11px; color:#d1d5db; text-align:center;">© ${year} GatiMitra. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: copy.subject, text, html };
}
