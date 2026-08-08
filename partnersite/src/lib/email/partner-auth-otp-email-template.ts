/**
 * GatiMitra Partner auth OTP email — HTML for Supabase Dashboard paste or custom SMTP.
 * Supabase Magic Link template variable: {{ .Token }}
 */

export const GM_EMAIL = {
  sidebar: '#006B4F',
  gati: '#00A88F',
  mitra: '#F5A623',
  secondary: '#E5F5F0',
  wave: '#2B8C76',
  text: '#1e293b',
  muted: '#64748b',
} as const;

export const PARTNER_OTP_EMAIL_SUBJECT = 'Verify your GatiMitra Partner account';

/** Paste into Supabase → Authentication → Email Templates → Magic Link (body). */
export const SUPABASE_PARTNER_OTP_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${PARTNER_OTP_EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f4;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:${GM_EMAIL.sidebar};border-radius:16px 16px 0 0;padding:28px 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;letter-spacing:-0.3px;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
                      <span style="color:${GM_EMAIL.gati};">Gati</span><span style="color:${GM_EMAIL.mitra};">Mitra</span>
                    </span>
                    <span style="display:block;margin-top:4px;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,0.75);">Partner Platform</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:20px;">
                    <h1 style="margin:0;font-size:24px;font-weight:700;line-height:1.3;color:#ffffff;">Verify your business email</h1>
                    <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:${GM_EMAIL.secondary};">Use the code below to confirm your email and continue creating your GatiMitra Partner account.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${GM_EMAIL.muted};">Your verification code</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="background-color:${GM_EMAIL.secondary};border:2px solid ${GM_EMAIL.gati};border-radius:14px;padding:24px 16px;">
                    <span style="font-size:34px;font-weight:800;letter-spacing:8px;color:${GM_EMAIL.sidebar};font-family:'Courier New',Courier,monospace;">{{ .Token }}</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;line-height:1.55;color:#92400e;">
                      <strong>Valid for a limited time.</strong> Enter this code on the partner registration page. Never share it with anyone — including GatiMitra support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.65;color:${GM_EMAIL.muted};">
                If you did not start creating a partner account, you can safely ignore this email. Your inbox will remain secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:22px 32px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                Need help? <a href="mailto:support@gatimitra.com" style="color:${GM_EMAIL.gati};font-weight:600;text-decoration:none;">support@gatimitra.com</a>
              </p>
              <p style="margin:14px 0 0;font-size:11px;color:#cbd5e1;text-align:center;">
                <a href="https://partner.gatimitra.com" style="color:${GM_EMAIL.gati};text-decoration:none;">partner.gatimitra.com</a>
                &nbsp;·&nbsp; © GatiMitra
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/** Login variant — use if you configure a separate Supabase template for sign-in. */
export const SUPABASE_PARTNER_LOGIN_OTP_EMAIL_HTML = SUPABASE_PARTNER_OTP_EMAIL_HTML
  .replace('Verify your business email', 'Sign in to your partner account')
  .replace(
    'Use the code below to confirm your email and continue creating your GatiMitra Partner account.',
    'Use the code below to verify your email and sign in to your GatiMitra Partner dashboard.',
  )
  .replace(
    'Enter this code on the partner registration page.',
    'Enter this code on the partner sign-in page.',
  )
  .replace(
    'If you did not start creating a partner account, you can safely ignore this email. Your inbox will remain secure.',
    'If you did not attempt to sign in, you can safely ignore this email. Your account will remain secure.',
  );

export function formatOtpForEmailDisplay(token: string): string {
  const digits = token.replace(/\D/g, '');
  return digits.split('').join(' ');
}

/** HTML for Send Email hook / SMTP — replaces Supabase {{ .Token }}. */
export function buildPartnerRegisterOtpEmailHtml(token: string, emailActionType?: string): string {
  const isSignup =
    !emailActionType ||
    emailActionType === 'signup' ||
    emailActionType === 'magiclink' ||
    emailActionType === 'invite';
  const base = isSignup ? SUPABASE_PARTNER_OTP_EMAIL_HTML : SUPABASE_PARTNER_LOGIN_OTP_EMAIL_HTML;
  const displayToken = formatOtpForEmailDisplay(token);
  return base.replace(/\{\{\s*\.Token\s*\}\}/g, displayToken);
}

export function partnerOtpEmailSubject(emailActionType?: string): string {
  const isSignup =
    !emailActionType ||
    emailActionType === 'signup' ||
    emailActionType === 'magiclink' ||
    emailActionType === 'invite';
  return isSignup ? PARTNER_OTP_EMAIL_SUBJECT : 'Sign in to your GatiMitra Partner account';
}
