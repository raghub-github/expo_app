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

export function buildEmailVerificationMessage(otp: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Your GatiMitra email verification code";

  const text = [
    "GatiMitra — Email verification",
    "",
    `Your verification code is: ${otp}`,
    "",
    "This code expires in 5 minutes.",
    "Do not share this code with anyone.",
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Team GatiMitra",
    "support@gatimitra.com",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subject)}</title>
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
                    <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.3px;">Verify your email</h1>
                    <p style="margin:8px 0 0; color:rgba(255,255,255,0.92); font-size:14px; line-height:1.6;">Use the code below to complete email verification on your GatiMitra account.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="content" style="background:#ffffff; padding:32px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:#6b7280;">Verification code</p>
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
                      Enter this code in the GatiMitra app to verify your email address.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0; font-size:13px; line-height:1.65; color:#6b7280;">
                For your security, never share this code with anyone — including GatiMitra support.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 18px 18px; padding:20px 32px 28px;">
              <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">
                If you did not request this email, you can safely ignore it.<br />
                Need help? Contact us at <a href="mailto:support@gatimitra.com" style="color:#16a34a; font-weight:600;">support@gatimitra.com</a>
              </p>
              <p style="margin:14px 0 0; font-size:11px; color:#d1d5db; text-align:center;">© ${new Date().getFullYear()} GatiMitra. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
