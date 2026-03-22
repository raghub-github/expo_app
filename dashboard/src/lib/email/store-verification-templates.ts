/**
 * Partner-style HTML emails (aligned with partnersite register-store welcome layout).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHARED_STYLES = `<style>
  body, table, td, p, a { margin:0; padding:0; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  @media only screen and (max-width: 620px) {
    .wrapper { width:100% !important; padding:16px !important; }
    .card { border-radius:16px !important; }
    .content { padding:20px !important; }
    .h1 { font-size:22px !important; }
    .body { font-size:14px !important; }
    .cta { width:100% !important; }
  }
</style>`;

function layoutEmail(args: {
  pageTitle: string;
  headerBadgeHtml: string;
  headerTitle: string;
  headerSubtitle: string;
  headerRibbonHtml: string;
  bodyInnerHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerExtraHtml?: string;
}): string {
  const { pageTitle, headerBadgeHtml, headerTitle, headerSubtitle, headerRibbonHtml, bodyInnerHtml, ctaLabel, ctaUrl, footerExtraHtml } = args;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  ${SHARED_STYLES}
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:24px 12px;">
    <tr>
      <td align="center">
        <table class="wrapper" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f97316 0%, #22c55e 52%, #0ea5e9 100%); border-radius:20px 20px 0 0; padding:0;">
                <tr>
                  <td style="padding:22px 24px 18px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left">
                          <div style="display:inline-block; background:rgba(255,255,255,0.92); border:1px solid rgba(255,255,255,0.55); border-radius:999px; padding:7px 14px; box-shadow:0 10px 22px rgba(15,23,42,0.18);">
                            <span style="font-size:14px; font-weight:800; letter-spacing:0.2px; color:#0f172a;">
                              Gati<span style="color:#16a34a;">Mitra</span>
                            </span>
                            <span style="display:inline-block; margin-left:10px; font-size:11px; font-weight:700; color:#0f172a; opacity:0.75;">
                              Partner
                            </span>
                          </div>
                          ${headerBadgeHtml}
                        </td>
                        <td align="right" style="vertical-align:top;">
                          ${headerRibbonHtml}
                        </td>
                      </tr>
                    </table>
                    <h1 class="h1" style="margin:16px 0 6px 0; color:#ffffff; font-size:26px; font-weight:800; letter-spacing:-0.2px;">
                      ${headerTitle}
                    </h1>
                    <p style="margin:0; color:rgba(255,255,255,0.92); font-size:14px; line-height:1.65;">
                      ${headerSubtitle}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table class="card" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:0 0 20px 20px; box-shadow:0 12px 30px rgba(15,23,42,0.12); overflow:hidden;">
                <tr>
                  <td class="content" style="padding:24px 28px 22px 28px;">
                    ${bodyInnerHtml}
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td align="center">
                          <a href="${escapeHtml(ctaUrl)}" target="_blank" class="cta" style="display:inline-block; padding:12px 28px; border-radius:999px; background:linear-gradient(135deg,#10b981,#22c55e); color:#ffffff !important; font-size:14px; font-weight:600; box-shadow:0 10px 24px rgba(16,185,129,0.35);">${escapeHtml(ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb; padding-top:16px;">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px 0; font-size:13px; color:#4b5563; line-height:1.7;">If you have any questions or need assistance, feel free to reply to this email—we’re here to help.</p>
                          <p style="margin:0; font-size:13px; color:#4b5563; line-height:1.7;">
                            You can also reach us at <a href="mailto:support@gatimitra.com" style="color:#2563eb;">support@gatimitra.com</a>.
                          </p>
                        </td>
                      </tr>
                    </table>
                    ${footerExtraHtml ?? ""}
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                      <tr>
                        <td>
                          <p style="margin:0; font-size:13px; color:#111827; line-height:1.7;">Best regards,<br /><strong>Team GatiMitra</strong></p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f9fafb; padding:14px 18px; text-align:center; border-top:1px solid #e5e7eb;">
                    <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.6;">
                      GatiMitra On-Demand Services Private Limited<br />
                      India’s Leading Low-Cost Delivery Platform<br />
                      <a href="https://partner.gatimitra.com" style="color:#2563eb;">partner.gatimitra.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildStoreApprovedEmail(args: {
  storeName: string;
  storePublicId: string;
  dashboardUrl: string;
}): { subject: string; text: string; html: string } {
  const safeName = escapeHtml(args.storeName.trim() || "your store");
  const safeId = escapeHtml(args.storePublicId.trim());

  const textLines = [
    "Dear Partner,",
    "",
    `Your store ${args.storeName.trim() || "your store"} (Store ID: ${args.storePublicId}) has been successfully verified by the GatiMitra team.`,
    "",
    "You can now make your store live at your convenience and start receiving orders. Please ensure you are fully prepared to manage incoming orders smoothly.",
    "",
    `View Dashboard: ${args.dashboardUrl}`,
    "",
    "If you have any questions or need assistance, feel free to reply to this email—we’re here to help.",
    "",
    "Best regards,",
    "Team GatiMitra",
  ];

  const html = layoutEmail({
    pageTitle: "Your store has been verified",
    headerBadgeHtml: `
          <div style="margin-top:8px; display:inline-block; background:rgba(15,23,42,0.10); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; color:#0f172a; border:1px solid rgba(15,23,42,0.08);">
            Store ID&nbsp;<span style="color:#022c22;">#${safeId}</span>
          </div>`,
    headerTitle: "Your store is verified ✓",
    headerSubtitle: `${safeName} — you can go live when you’re ready.`,
    headerRibbonHtml: `<div style="display:inline-block; background:rgba(255,255,255,0.20); border:1px solid rgba(255,255,255,0.35); border-radius:999px; padding:7px 10px; color:#ffffff; font-size:11px; font-weight:700;">Verified</div>`,
    bodyInnerHtml: `
                    <p class="body" style="margin:0 0 12px 0; font-size:14px; color:#111827; line-height:1.7;">
                      Dear Partner,
                    </p>
                    <p class="body" style="margin:0 0 18px 0; font-size:14px; color:#4b5563; line-height:1.7;">
                      Your store <strong>${safeName}</strong> (Store ID: <strong>${safeId}</strong>) has been successfully verified by the GatiMitra team.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf3; border-radius:12px; border:1px solid #bbf7d0; margin-bottom:18px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0; font-size:14px; font-weight:600; color:#166534;">You’re cleared to go live</p>
                        <p style="margin:8px 0 0 0; font-size:13px; color:#166534; line-height:1.65;">
                          You can now make your store live at your convenience and start receiving orders. Please ensure you are fully prepared to manage incoming orders smoothly.
                        </p>
                      </td></tr>
                    </table>`,
    ctaLabel: "View Dashboard",
    ctaUrl: args.dashboardUrl,
  });

  return {
    subject: "Your Store Has Been Verified – GatiMitra",
    text: textLines.join("\n"),
    html,
  };
}

export function buildStoreRejectedEmail(args: {
  storeName: string;
  storePublicId: string;
  dashboardUrl: string;
  reason: string;
}): { subject: string; text: string; html: string } {
  const safeName = escapeHtml(args.storeName.trim() || "your store");
  const safeId = escapeHtml(args.storePublicId.trim());
  const reason = args.reason.trim();
  const safeReason = escapeHtml(reason);

  const displayName = args.storeName.trim() || "your store";
  const displayId = args.storePublicId.trim();
  const mainMessage = `We have reviewed your onboarding for ${displayName} (Store ID: ${displayId}). Kindly review your submitted details and update them from the partner dashboard, or you may share the corrected information by replying to this email so we can proceed with the verification process.`;

  const textLines = [
    "Dear Partner,",
    "",
    mainMessage,
    "",
    `Reason for rejection:\n${reason}`,
    "",
    `Partner dashboard: ${args.dashboardUrl}`,
    "",
    "Best regards,",
    "Team GatiMitra",
  ];

  const html = layoutEmail({
    pageTitle: "Please review and update your details",
    headerBadgeHtml: `
          <div style="margin-top:8px; display:inline-block; background:rgba(15,23,42,0.10); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; color:#0f172a; border:1px solid rgba(15,23,42,0.08);">
            Store ID&nbsp;<span style="color:#022c22;">#${safeId}</span>
          </div>`,
    headerTitle: "Please review and update your details",
    headerSubtitle: `${safeName} — we need a quick update from you.`,
    headerRibbonHtml: `<div style="display:inline-block; background:rgba(180,83,9,0.45); border:1px solid rgba(254,215,170,0.6); border-radius:999px; padding:7px 10px; color:#ffffff; font-size:11px; font-weight:700;">Action needed</div>`,
    bodyInnerHtml: `
                    <p class="body" style="margin:0 0 12px 0; font-size:14px; color:#111827; line-height:1.7;">
                      Dear Partner,
                    </p>
                    <p class="body" style="margin:0 0 18px 0; font-size:14px; color:#4b5563; line-height:1.7;">
                      We have reviewed your onboarding for <strong>${safeName}</strong> (Store ID: <strong>${safeId}</strong>). Kindly review your submitted details and update them from the partner dashboard, or you may share the corrected information by replying to this email so we can proceed with the verification process.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2; border-radius:12px; border:1px solid #fecaca; margin-bottom:18px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 6px 0; font-size:12px; font-weight:700; color:#991b1b;">Reason for rejection</p>
                        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.65; white-space:pre-wrap;">${safeReason}</p>
                      </td></tr>
                    </table>`,
    ctaLabel: "View Dashboard",
    ctaUrl: args.dashboardUrl,
  });

  return {
    subject: "Please Review and Update Your Details – GatiMitra",
    text: textLines.join("\n"),
    html,
  };
}

/** Email when a single onboarding step is rejected (set back to pending) — not full store rejection. */
export function buildVerificationStepRejectedEmail(args: {
  storeName: string;
  storePublicId: string;
  dashboardUrl: string;
  stepNumber: number;
  stepLabel: string;
  reason: string;
}): { subject: string; text: string; html: string } {
  const safeName = escapeHtml(args.storeName.trim() || "your store");
  const safeId = escapeHtml(args.storePublicId.trim());
  const safeStep = escapeHtml(args.stepLabel.trim() || `Step ${args.stepNumber}`);
  const reason = args.reason.trim();
  const safeReason = escapeHtml(reason);

  const displayName = args.storeName.trim() || "your store";
  const displayId = args.storePublicId.trim();
  const stepLine = `${args.stepLabel.trim() || `Step ${args.stepNumber}`} (step ${args.stepNumber} of 7)`;
  const mainMessage = `We have reviewed your onboarding for ${displayName} (Store ID: ${displayId}), including ${stepLine}. Kindly review your submitted details and update them from the partner dashboard, or you may share the corrected information by replying to this email so we can proceed with the verification process.`;

  const textLines = [
    "Dear Partner,",
    "",
    mainMessage,
    "",
    `Reason for rejection:\n${reason}`,
    "",
    `Partner dashboard: ${args.dashboardUrl}`,
    "",
    "Best regards,",
    "Team GatiMitra",
  ];

  const html = layoutEmail({
    pageTitle: "Please review and update your details",
    headerBadgeHtml: `
          <div style="margin-top:8px; display:inline-block; background:rgba(15,23,42,0.10); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; color:#0f172a; border:1px solid rgba(15,23,42,0.08);">
            Store ID&nbsp;<span style="color:#022c22;">#${safeId}</span>
          </div>`,
    headerTitle: "Please review and update your details",
    headerSubtitle: `${safeName} — ${safeStep}`,
    headerRibbonHtml: `<div style="display:inline-block; background:rgba(180,83,9,0.45); border:1px solid rgba(254,215,170,0.6); border-radius:999px; padding:7px 10px; color:#ffffff; font-size:11px; font-weight:700;">Action needed</div>`,
    bodyInnerHtml: `
                    <p class="body" style="margin:0 0 12px 0; font-size:14px; color:#111827; line-height:1.7;">
                      Dear Partner,
                    </p>
                    <p class="body" style="margin:0 0 18px 0; font-size:14px; color:#4b5563; line-height:1.7;">
                      We have reviewed your onboarding for <strong>${safeName}</strong> (Store ID: <strong>${safeId}</strong>), including <strong>${safeStep}</strong> (step ${args.stepNumber} of 7). Kindly review your submitted details and update them from the partner dashboard, or you may share the corrected information by replying to this email so we can proceed with the verification process.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2; border-radius:12px; border:1px solid #fecaca; margin-bottom:18px;">
                      <tr><td style="padding:14px 16px;">
                        <p style="margin:0 0 6px 0; font-size:12px; font-weight:700; color:#991b1b;">Reason for rejection</p>
                        <p style="margin:0; font-size:13px; color:#7f1d1d; line-height:1.65; white-space:pre-wrap;">${safeReason}</p>
                      </td></tr>
                    </table>`,
    ctaLabel: "View Dashboard",
    ctaUrl: args.dashboardUrl,
  });

  return {
    subject: "Please Review and Update Your Details – GatiMitra",
    text: textLines.join("\n"),
    html,
  };
}
