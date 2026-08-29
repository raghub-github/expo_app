/**
 * Sends confirmation emails for merchant manual withdrawals:
 *  - request received (PENDING)
 *  - withdrawal processed (COMPLETED / paid)
 *
 * Recipient is always the parent account email (merchant_parents.owner_email),
 * with auth.users / store_email fallbacks. Failures are logged only —
 * withdrawal success must not depend on SMTP.
 */
import { getSql } from "../db/client.js";
import { createSmtpTransporter, formatSmtpFrom, getSmtpConfig } from "./smtp-config.js";
import {
  buildMerchantWithdrawalCompletedEmail,
  buildMerchantWithdrawalRequestReceivedEmail,
} from "../services/email/merchantWithdrawalRequestEmail.js";

const SUPPORT_EMAIL_DEFAULT = "support@gatimitra.com";

type MerchantWithdrawalContact = {
  email: string | null;
  name: string;
  storeName: string;
  storePublicId: string | null;
};

function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

async function loadMerchantWithdrawalContact(storeId: number): Promise<MerchantWithdrawalContact> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      s.store_name,
      s.store_id AS store_public_id,
      s.store_email,
      mp.owner_name,
      mp.parent_name,
      mp.owner_email,
      mp.supabase_user_id
    FROM merchant_stores s
    LEFT JOIN merchant_parents mp ON mp.id = s.parent_id
    WHERE s.id = ${storeId}
    LIMIT 1
  `;
  const r = rows[0] as
    | {
        store_name?: string;
        store_public_id?: string;
        store_email?: string | null;
        owner_name?: string | null;
        parent_name?: string | null;
        owner_email?: string | null;
        supabase_user_id?: string | null;
      }
    | undefined;

  if (!r) {
    return {
      email: null,
      name: "there",
      storeName: `Store #${storeId}`,
      storePublicId: null,
    };
  }

  // Prefer parent account login email (owner_email), then auth.users, then store_email.
  let emailRaw = normalizeEmail(r.owner_email);

  if (!emailRaw && r.supabase_user_id) {
    try {
      const authRows = await sql`
        SELECT email
        FROM auth.users
        WHERE id = ${String(r.supabase_user_id)}::uuid
        LIMIT 1
      `;
      emailRaw = normalizeEmail((authRows[0] as { email?: string | null } | undefined)?.email);
    } catch {
      /* auth.users may be inaccessible on some DB roles */
    }
  }

  if (!emailRaw) {
    emailRaw = normalizeEmail(r.store_email);
  }

  const nameRaw =
    (r.owner_name && r.owner_name.trim()) || (r.parent_name && r.parent_name.trim()) || "there";

  return {
    email: emailRaw,
    name: nameRaw,
    storeName: String(r.store_name ?? `Store #${storeId}`),
    storePublicId: r.store_public_id ? String(r.store_public_id) : null,
  };
}

type MerchantWithdrawalPayoutRow = {
  store_id: number;
  amount: number;
  net_payout_amount: number;
  status: string;
  utr_reference: string | null;
};

async function loadMerchantWithdrawalPayout(
  payoutRequestId: number
): Promise<MerchantWithdrawalPayoutRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      w.merchant_store_id AS store_id,
      pr.amount,
      pr.net_payout_amount,
      pr.status,
      pr.utr_reference
    FROM merchant_payout_requests pr
    JOIN merchant_wallet w ON w.id = pr.wallet_id
    WHERE pr.id = ${payoutRequestId}
    LIMIT 1
  `;
  const r = rows[0] as
    | {
        store_id?: number;
        amount?: number | string;
        net_payout_amount?: number | string;
        status?: string;
        utr_reference?: string | null;
      }
    | undefined;
  if (!r || r.store_id == null) return null;
  return {
    store_id: Number(r.store_id),
    amount: Number(r.amount ?? 0),
    net_payout_amount: Number(r.net_payout_amount ?? r.amount ?? 0),
    status: String(r.status ?? "").toUpperCase(),
    utr_reference: r.utr_reference != null ? String(r.utr_reference) : null,
  };
}

function isPaidStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === "COMPLETED" || s === "PAID" || s === "SUCCESS";
}

async function sendBuiltMerchantWithdrawalEmail(args: {
  storeId: number;
  payoutRequestId: number;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
  logTag: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const cfg = getSmtpConfig();
  if (!cfg.ok) {
    console.warn(
      `[${args.logTag}] smtp_not_configured — set EMAIL_ID + EMAIL_APP_PASSWORD in backend/.env.local or repo-root .env.local (payout_request_id=${args.payoutRequestId})`
    );
    return { ok: false, error: "smtp_not_configured" };
  }

  try {
    const transporter = await createSmtpTransporter();
    if (!transporter) throw new Error("smtp_transporter_null");
    await transporter.sendMail({
      from: formatSmtpFrom() ?? cfg.fromEmail,
      to: args.recipientEmail,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    console.info(
      `[${args.logTag}] sent to=${args.recipientEmail} store_id=${args.storeId} payout_request_id=${args.payoutRequestId}`
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[${args.logTag}] send_failed payout_request_id=${args.payoutRequestId} store_id=${args.storeId} to=${args.recipientEmail}: ${msg}`
    );
    return { ok: false, error: msg };
  }
}

export async function sendMerchantWithdrawalRequestReceivedEmail(args: {
  storeId: number;
  payoutRequestId: number;
  amountRupees: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const contact = await loadMerchantWithdrawalContact(args.storeId);
  if (!contact.email) {
    console.warn(
      `[merchant-withdrawal-email] no_recipient_email store_id=${args.storeId} payout_request_id=${args.payoutRequestId} (set merchant_parents.owner_email)`
    );
    return { ok: false, skipped: true, error: "no_recipient_email" };
  }

  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || SUPPORT_EMAIL_DEFAULT;
  const email = buildMerchantWithdrawalRequestReceivedEmail({
    merchantName: contact.name,
    storeName: contact.storeName,
    storePublicId: contact.storePublicId,
    amountRupees: args.amountRupees,
    supportEmail,
  });

  return sendBuiltMerchantWithdrawalEmail({
    storeId: args.storeId,
    payoutRequestId: args.payoutRequestId,
    recipientEmail: contact.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    logTag: "merchant-withdrawal-email",
  });
}

export async function sendMerchantWithdrawalCompletedEmail(args: {
  storeId: number;
  payoutRequestId: number;
  amountRupees: number;
  netPayoutAmountRupees: number;
  utrReference?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const contact = await loadMerchantWithdrawalContact(args.storeId);
  if (!contact.email) {
    console.warn(
      `[merchant-withdrawal-completed-email] no_recipient_email store_id=${args.storeId} payout_request_id=${args.payoutRequestId} (set merchant_parents.owner_email)`
    );
    return { ok: false, skipped: true, error: "no_recipient_email" };
  }

  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || SUPPORT_EMAIL_DEFAULT;
  const email = buildMerchantWithdrawalCompletedEmail({
    merchantName: contact.name,
    storeName: contact.storeName,
    storePublicId: contact.storePublicId,
    amountRupees: args.amountRupees,
    netPayoutAmountRupees: args.netPayoutAmountRupees,
    utrReference: args.utrReference ?? null,
    supportEmail,
  });

  return sendBuiltMerchantWithdrawalEmail({
    storeId: args.storeId,
    payoutRequestId: args.payoutRequestId,
    recipientEmail: contact.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    logTag: "merchant-withdrawal-completed-email",
  });
}

/** Loads payout + store context and sends the processed email when status is COMPLETED/PAID. */
export async function notifyMerchantWithdrawalCompletedEmail(
  payoutRequestId: number
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const payout = await loadMerchantWithdrawalPayout(payoutRequestId);
  if (!payout) {
    return { ok: false, error: "payout_not_found" };
  }
  if (!isPaidStatus(payout.status)) {
    return { ok: false, skipped: true, error: `payout_not_completed:${payout.status}` };
  }
  return sendMerchantWithdrawalCompletedEmail({
    storeId: payout.store_id,
    payoutRequestId,
    amountRupees: payout.amount,
    netPayoutAmountRupees: payout.net_payout_amount,
    utrReference: payout.utr_reference,
  });
}
