/**
 * Email templates for merchant subscription lifecycle events.
 *
 * Four events — one HTML+text renderer each:
 *   EXPIRY_REMINDER_3D           → "Your Growth Plan renews in 3 days"
 *   RENEW_SUCCESS                → "Your subscription renewed successfully"
 *   RENEW_FAILED_INSUFFICIENT    → "Auto-renew failed — top up your wallet"
 *   EXPIRED                      → "Your subscription has expired"
 *
 * All templates share a common brand header/footer + a consistent CTA style.
 * Kept as a single file so a template tweak (colors, wording, footer) is
 * one place.
 */

export type CommonRenderContext = {
  merchantName: string;
  storeName: string;
  storeId: string | null;      // public id like GMMC1015
  planName: string;
  planPriceRupees: number;
  billingCycle: string;         // "MONTHLY" | "YEARLY" | "QUARTERLY"
  expiryDateIso: string;        // when the current sub expires
  supportEmail: string;
  merchantAppUrl?: string;      // deep link to Plans screen if we know it
};

const BRAND_PRIMARY = "#16A34A";
const BRAND_DARK = "#15803D";
const BG = "#F9FAFB";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const DANGER = "#DC2626";
const AMBER = "#B45309";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function inr(rupees: number): string {
  return `₹${Number(rupees).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function wrapHtml(args: {
  headerBg: string;
  headerText: string;
  title: string;
  bodyHtml: string;
  supportEmail: string;
}): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${args.headerBg};padding:22px 24px;color:${args.headerText};">
            <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.85;">GatiMitra · Merchant</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">${escapeHtml(args.title)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 24px;font-size:14px;line-height:22px;color:${TEXT};">
            ${args.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid ${BORDER};font-size:11px;line-height:18px;color:${MUTED};background:${BG};">
            Questions? Reply to this email or write to <a href="mailto:${escapeHtml(args.supportEmail)}" style="color:${BRAND_DARK};">${escapeHtml(args.supportEmail)}</a>.<br>
            You're receiving this because your GatiMitra merchant account has an active subscription.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function summaryTable(rows: Array<{ label: string; value: string; strong?: boolean }>): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BORDER};border-radius:8px;background:${BG};margin:12px 0;">
    ${rows
      .map(
        (r) => `<tr>
      <td style="padding:8px 12px;font-size:12px;color:${MUTED};width:45%;">${escapeHtml(r.label)}</td>
      <td style="padding:8px 12px;font-size:13px;color:${TEXT};font-weight:${r.strong ? 700 : 500};text-align:right;">${escapeHtml(r.value)}</td>
    </tr>`
      )
      .join("")}
  </table>`;
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 1. EXPIRY REMINDER — 3 days before
 * ═════════════════════════════════════════════════════════════════════════════ */

export function buildExpiryReminder3dEmail(
  ctx: CommonRenderContext & {
    daysRemaining: number;
    autoRenewEnabled: boolean;
    walletBalanceRupees: number | null;
    willAutoRenew: boolean; // true iff autoRenew=true AND wallet >= price
  }
): { subject: string; html: string; text: string } {
  const subject = ctx.willAutoRenew
    ? `Your ${ctx.planName} will auto-renew on ${fmtDate(ctx.expiryDateIso)}`
    : ctx.autoRenewEnabled
    ? `Action needed: top up wallet to auto-renew ${ctx.planName} (${ctx.daysRemaining} days left)`
    : `Your ${ctx.planName} expires in ${ctx.daysRemaining} days`;

  const summary = summaryTable([
    { label: "Store", value: ctx.storeName + (ctx.storeId ? ` · ${ctx.storeId}` : "") },
    { label: "Plan", value: ctx.planName },
    { label: "Price", value: `${inr(ctx.planPriceRupees)} / ${ctx.billingCycle.toLowerCase()}`, strong: true },
    { label: "Current period ends", value: fmtDate(ctx.expiryDateIso), strong: true },
    { label: "Auto-renew", value: ctx.autoRenewEnabled ? "Enabled" : "Disabled" },
    ...(ctx.walletBalanceRupees != null
      ? [{ label: "Wallet balance", value: inr(ctx.walletBalanceRupees) }]
      : []),
  ]);

  const banner = ctx.willAutoRenew
    ? `<div style="background:#DCFCE7;border:1px solid #86EFAC;border-radius:8px;padding:12px;color:${BRAND_DARK};font-size:13px;margin-bottom:12px;">
         <strong>Auto-renew is ON</strong> and your wallet has enough balance.
         We'll deduct ${inr(ctx.planPriceRupees)} on ${fmtDate(ctx.expiryDateIso)} — no action needed.
       </div>`
    : ctx.autoRenewEnabled
    ? `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px;color:${AMBER};font-size:13px;margin-bottom:12px;">
         <strong>Auto-renew is ON, but your wallet is short.</strong>
         We'll try to deduct ${inr(ctx.planPriceRupees)} on ${fmtDate(ctx.expiryDateIso)}.
         Top up your wallet or renew manually before then to avoid an interruption.
       </div>`
    : `<div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;color:${DANGER};font-size:13px;margin-bottom:12px;">
         <strong>Auto-renew is OFF.</strong> Your subscription will lapse on ${fmtDate(ctx.expiryDateIso)}
         unless you renew manually. You'll lose paid features when that happens.
       </div>`;

  const cta = `<div style="margin:16px 0;">
    <a href="${escapeHtml(ctx.merchantAppUrl ?? "#")}" style="display:inline-block;background:${BRAND_PRIMARY};color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
      Open Plans in the app
    </a>
  </div>`;

  const bodyHtml = `
    <div>Hi ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:8px;">Your ${escapeHtml(ctx.planName)} subscription for <strong>${escapeHtml(ctx.storeName)}</strong> is coming up for renewal in <strong>${ctx.daysRemaining} day${ctx.daysRemaining === 1 ? "" : "s"}</strong>.</div>
    ${banner}
    ${summary}
    ${cta}
  `;

  const text =
    `Hi ${ctx.merchantName},\n\n` +
    `Your ${ctx.planName} subscription for ${ctx.storeName} renews in ${ctx.daysRemaining} day(s), on ${fmtDate(ctx.expiryDateIso)}.\n\n` +
    (ctx.willAutoRenew
      ? `Auto-renew is ON and your wallet has enough balance. We'll deduct ${inr(ctx.planPriceRupees)} automatically. No action needed.\n\n`
      : ctx.autoRenewEnabled
      ? `Auto-renew is ON, but your wallet balance is short. Please top up before ${fmtDate(ctx.expiryDateIso)}.\n\n`
      : `Auto-renew is OFF. Please renew manually before ${fmtDate(ctx.expiryDateIso)} to avoid losing paid features.\n\n`) +
    `Plan: ${ctx.planName}\nPrice: ${inr(ctx.planPriceRupees)} / ${ctx.billingCycle.toLowerCase()}\nExpiry: ${fmtDate(ctx.expiryDateIso)}\n\n` +
    `— GatiMitra Team`;

  return {
    subject,
    html: wrapHtml({
      headerBg: `linear-gradient(135deg,${BRAND_PRIMARY} 0%,${BRAND_DARK} 100%)`,
      headerText: "#FFFFFF",
      title: "Subscription renewal reminder",
      bodyHtml,
      supportEmail: ctx.supportEmail,
    }),
    text,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 2. RENEW SUCCESS
 * ═════════════════════════════════════════════════════════════════════════════ */

export function buildRenewSuccessEmail(
  ctx: CommonRenderContext & {
    amountChargedRupees: number;
    debitedFromWalletRupees: number;
    newExpiryDateIso: string;
    walletBalanceAfterRupees: number | null;
    paymentId: number | null;
  }
): { subject: string; html: string; text: string } {
  const subject = `${ctx.planName} renewed — next billing ${fmtDate(ctx.newExpiryDateIso)}`;

  const summary = summaryTable([
    { label: "Store", value: ctx.storeName + (ctx.storeId ? ` · ${ctx.storeId}` : "") },
    { label: "Plan", value: ctx.planName },
    { label: "Amount charged", value: inr(ctx.amountChargedRupees), strong: true },
    { label: "Paid from", value: "Wallet" },
    { label: "Next billing", value: fmtDate(ctx.newExpiryDateIso), strong: true },
    ...(ctx.walletBalanceAfterRupees != null
      ? [{ label: "Wallet balance now", value: inr(ctx.walletBalanceAfterRupees) }]
      : []),
    ...(ctx.paymentId ? [{ label: "Payment reference", value: `#${ctx.paymentId}` }] : []),
  ]);

  const bodyHtml = `
    <div>Hi ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:8px;">Your <strong>${escapeHtml(ctx.planName)}</strong> subscription for <strong>${escapeHtml(ctx.storeName)}</strong> has been renewed successfully from your wallet.</div>
    ${summary}
    <div style="margin-top:8px;color:${MUTED};font-size:12.5px;">
      You'll receive another reminder 3 days before the next renewal on ${fmtDate(ctx.newExpiryDateIso)}.
    </div>
  `;

  const text =
    `Hi ${ctx.merchantName},\n\n` +
    `Your ${ctx.planName} subscription for ${ctx.storeName} has been renewed.\n\n` +
    `Amount charged: ${inr(ctx.amountChargedRupees)} (from wallet)\n` +
    `Next billing: ${fmtDate(ctx.newExpiryDateIso)}\n` +
    (ctx.walletBalanceAfterRupees != null
      ? `Wallet balance now: ${inr(ctx.walletBalanceAfterRupees)}\n`
      : "") +
    `\n— GatiMitra Team`;

  return {
    subject,
    html: wrapHtml({
      headerBg: `linear-gradient(135deg,${BRAND_PRIMARY} 0%,${BRAND_DARK} 100%)`,
      headerText: "#FFFFFF",
      title: "Subscription renewed",
      bodyHtml,
      supportEmail: ctx.supportEmail,
    }),
    text,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 3. RENEW FAILED — INSUFFICIENT WALLET
 * ═════════════════════════════════════════════════════════════════════════════ */

export function buildRenewFailedInsufficientEmail(
  ctx: CommonRenderContext & {
    requiredRupees: number;
    walletBalanceRupees: number;
  }
): { subject: string; html: string; text: string } {
  const subject = `Auto-renew failed for ${ctx.planName} — top up your wallet`;
  const shortfall = Math.max(0, ctx.requiredRupees - ctx.walletBalanceRupees);

  const summary = summaryTable([
    { label: "Store", value: ctx.storeName + (ctx.storeId ? ` · ${ctx.storeId}` : "") },
    { label: "Plan", value: ctx.planName },
    { label: "Required", value: inr(ctx.requiredRupees), strong: true },
    { label: "Wallet balance", value: inr(ctx.walletBalanceRupees) },
    { label: "Shortfall", value: inr(shortfall), strong: true },
  ]);

  const cta = `<div style="margin:16px 0;">
    <a href="${escapeHtml(ctx.merchantAppUrl ?? "#")}" style="display:inline-block;background:${BRAND_PRIMARY};color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
      Renew manually
    </a>
  </div>`;

  const bodyHtml = `
    <div>Hi ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:8px;">We tried to auto-renew your <strong>${escapeHtml(ctx.planName)}</strong> subscription for <strong>${escapeHtml(ctx.storeName)}</strong>, but your wallet doesn't have enough balance.</div>
    <div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;color:${DANGER};font-size:13px;margin-top:12px;">
      Your subscription has been marked <strong>EXPIRED</strong>. You've lost access to paid features until you renew.
    </div>
    ${summary}
    ${cta}
    <div style="margin-top:8px;color:${MUTED};font-size:12.5px;">
      You can also complete more orders to earn into your wallet, or pay via Razorpay from the app.
    </div>
  `;

  const text =
    `Hi ${ctx.merchantName},\n\n` +
    `We tried to auto-renew your ${ctx.planName} subscription for ${ctx.storeName} but your wallet doesn't have enough balance.\n\n` +
    `Required: ${inr(ctx.requiredRupees)}\n` +
    `Wallet: ${inr(ctx.walletBalanceRupees)}\n` +
    `Shortfall: ${inr(shortfall)}\n\n` +
    `Your subscription is now EXPIRED. Please renew manually from the app to restore paid features.\n\n` +
    `— GatiMitra Team`;

  return {
    subject,
    html: wrapHtml({
      headerBg: `linear-gradient(135deg,#DC2626 0%,#B91C1C 100%)`,
      headerText: "#FFFFFF",
      title: "Auto-renew failed",
      bodyHtml,
      supportEmail: ctx.supportEmail,
    }),
    text,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 4. EXPIRED — subscription lapsed without renewal
 * ═════════════════════════════════════════════════════════════════════════════ */

export function buildExpiredEmail(
  ctx: CommonRenderContext
): { subject: string; html: string; text: string } {
  const subject = `Your ${ctx.planName} subscription has expired`;

  const summary = summaryTable([
    { label: "Store", value: ctx.storeName + (ctx.storeId ? ` · ${ctx.storeId}` : "") },
    { label: "Plan", value: ctx.planName },
    { label: "Expired on", value: fmtDate(ctx.expiryDateIso), strong: true },
  ]);

  const cta = `<div style="margin:16px 0;">
    <a href="${escapeHtml(ctx.merchantAppUrl ?? "#")}" style="display:inline-block;background:${BRAND_PRIMARY};color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
      Choose a plan
    </a>
  </div>`;

  const bodyHtml = `
    <div>Hi ${escapeHtml(ctx.merchantName)},</div>
    <div style="margin-top:8px;">Your <strong>${escapeHtml(ctx.planName)}</strong> subscription for <strong>${escapeHtml(ctx.storeName)}</strong> has expired.</div>
    ${summary}
    <div style="margin-top:8px;">You've been moved to the Free plan. Some paid features are now limited. Renew any time to restore them.</div>
    ${cta}
  `;

  const text =
    `Hi ${ctx.merchantName},\n\n` +
    `Your ${ctx.planName} subscription for ${ctx.storeName} expired on ${fmtDate(ctx.expiryDateIso)}.\n` +
    `You've been moved to the Free plan. Renew any time to restore paid features.\n\n` +
    `— GatiMitra Team`;

  return {
    subject,
    html: wrapHtml({
      headerBg: `linear-gradient(135deg,#6B7280 0%,#374151 100%)`,
      headerText: "#FFFFFF",
      title: "Subscription expired",
      bodyHtml,
      supportEmail: ctx.supportEmail,
    }),
    text,
  };
}
