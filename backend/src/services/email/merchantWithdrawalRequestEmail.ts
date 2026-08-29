/**
 * Email template when a merchant submits a manual wallet withdrawal
 * (merchant app or partner site).
 */

export type MerchantWithdrawalRequestEmailContext = {
  merchantName: string;
  storeName: string;
  storePublicId: string | null;
  amountRupees: number;
  supportEmail: string;
};

const BRAND_PRIMARY = "#16A34A";
const BRAND_DARK = "#15803D";
const BG = "#F9FAFB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inr(rupees: number): string {
  return `₹${Number(rupees).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function summaryTable(rows: Array<{ label: string; value: string }>): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BORDER};border-radius:8px;background:${BG};margin:12px 0;">
    ${rows
      .map(
        (r) => `<tr>
      <td style="padding:8px 12px;font-size:12px;color:${MUTED};width:45%;">${escapeHtml(r.label)}</td>
      <td style="padding:8px 12px;font-size:13px;color:${TEXT};font-weight:600;text-align:right;">${escapeHtml(r.value)}</td>
    </tr>`
      )
      .join("")}
  </table>`;
}

export function buildMerchantWithdrawalRequestReceivedEmail(
  ctx: MerchantWithdrawalRequestEmailContext
): { subject: string; html: string; text: string } {
  const storeIdLabel = ctx.storePublicId?.trim() || "—";
  const amountLabel = inr(ctx.amountRupees);
  const subject = `Withdrawal request received — ${ctx.storeName}`;

  const summary = summaryTable([
    { label: "Store Name", value: ctx.storeName },
    { label: "Store ID", value: storeIdLabel },
    { label: "Withdrawal Amount", value: amountLabel },
  ]);

  const bodyHtml = `
    <div>Dear ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:12px;">
      We have successfully received your withdrawal request for the following store:
    </div>
    ${summary}
    <div style="margin-top:12px;">
      Your withdrawal request is currently under processing. The requested amount will be credited to your registered bank account within
      <strong>24–48 hours</strong>, subject to successful verification and payment processing.
    </div>
    <div style="margin-top:12px;">
      You will receive an update once the withdrawal has been successfully processed.
    </div>
    <div style="margin-top:16px;">
      Thank you for your patience and for being a part of GatiMitra.
    </div>
    <div style="margin-top:20px;">
      Regards,<br>
      <strong>GatiMitra Team</strong>
    </div>
  `;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${BRAND_PRIMARY};padding:22px 24px;color:#FFFFFF;">
            <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">GatiMitra · Merchant</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">Withdrawal request received</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 24px;font-size:14px;line-height:22px;color:${TEXT};">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid ${BORDER};font-size:11px;line-height:18px;color:${MUTED};background:${BG};">
            Questions? Reply to this email or write to
            <a href="mailto:${escapeHtml(ctx.supportEmail)}" style="color:${BRAND_DARK};">${escapeHtml(ctx.supportEmail)}</a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text =
    `Dear ${ctx.merchantName},\n\n` +
    `We have successfully received your withdrawal request for the following store:\n\n` +
    `Store Name: ${ctx.storeName}\n` +
    `Store ID: ${storeIdLabel}\n` +
    `Withdrawal Amount: ${amountLabel}\n\n` +
    `Your withdrawal request is currently under processing. The requested amount will be credited to your registered bank account within 24–48 hours, subject to successful verification and payment processing.\n\n` +
    `You will receive an update once the withdrawal has been successfully processed.\n\n` +
    `Thank you for your patience and for being a part of GatiMitra.\n\n` +
    `Regards,\nGatiMitra Team`;

  return { subject, html, text };
}

export type MerchantWithdrawalCompletedEmailContext = {
  merchantName: string;
  storeName: string;
  storePublicId: string | null;
  amountRupees: number;
  netPayoutAmountRupees: number;
  utrReference: string | null;
  supportEmail: string;
};

export function buildMerchantWithdrawalCompletedEmail(
  ctx: MerchantWithdrawalCompletedEmailContext
): { subject: string; html: string; text: string } {
  const storeIdLabel = ctx.storePublicId?.trim() || "—";
  const amountLabel = inr(ctx.amountRupees);
  const netLabel = inr(ctx.netPayoutAmountRupees);
  const subject = `Withdrawal processed — ${ctx.storeName}`;

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: "Store Name", value: ctx.storeName },
    { label: "Store ID", value: storeIdLabel },
    { label: "Withdrawal Amount", value: amountLabel },
    { label: "Net Amount Credited", value: netLabel },
  ];
  if (ctx.utrReference?.trim()) {
    summaryRows.push({ label: "UTR Reference", value: ctx.utrReference.trim() });
  }

  const summary = summaryTable(summaryRows);

  const bodyHtml = `
    <div>Dear ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:12px;">
      Great news! Your withdrawal request has been <strong>successfully processed</strong> for the following store:
    </div>
    ${summary}
    <div style="margin-top:12px;">
      The net amount has been credited to your registered bank account. Please allow up to one business day for the funds to reflect in your bank statement, depending on your bank's processing time.
    </div>
    <div style="margin-top:16px;">
      Thank you for being a part of GatiMitra.
    </div>
    <div style="margin-top:20px;">
      Regards,<br>
      <strong>GatiMitra Team</strong>
    </div>
  `;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${BRAND_PRIMARY};padding:22px 24px;color:#FFFFFF;">
            <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">GatiMitra · Merchant</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">Withdrawal processed</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 24px;font-size:14px;line-height:22px;color:${TEXT};">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid ${BORDER};font-size:11px;line-height:18px;color:${MUTED};background:${BG};">
            Questions? Reply to this email or write to
            <a href="mailto:${escapeHtml(ctx.supportEmail)}" style="color:${BRAND_DARK};">${escapeHtml(ctx.supportEmail)}</a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const utrLine = ctx.utrReference?.trim()
    ? `UTR Reference: ${ctx.utrReference.trim()}\n`
    : "";

  const text =
    `Dear ${ctx.merchantName},\n\n` +
    `Great news! Your withdrawal request has been successfully processed for the following store:\n\n` +
    `Store Name: ${ctx.storeName}\n` +
    `Store ID: ${storeIdLabel}\n` +
    `Withdrawal Amount: ${amountLabel}\n` +
    `Net Amount Credited: ${netLabel}\n` +
    utrLine +
    `\nThe net amount has been credited to your registered bank account. Please allow up to one business day for the funds to reflect in your bank statement, depending on your bank's processing time.\n\n` +
    `Thank you for being a part of GatiMitra.\n\n` +
    `Regards,\nGatiMitra Team`;

  return { subject, html, text };
}
