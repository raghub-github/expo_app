/**
 * Merchant subscription lifecycle tick.
 *
 * Runs periodically (wired into the 10-min cron in index.ts) and executes
 * three passes in order:
 *
 *   1. sendExpiryReminders()      — for subs expiring in 2-4 days, send a
 *                                    RENEWAL_REMINDER email (dedupe: one per
 *                                    expiry date).
 *   2. runAutoRenewals()          — for subs due for renewal (billing date
 *                                    passed) with auto_renew=true, attempt
 *                                    wallet debit. Log every attempt in
 *                                    merchant_subscription_renewal_attempts.
 *                                    Send RENEW_SUCCESS or
 *                                    RENEW_FAILED_INSUFFICIENT email.
 *   3. sendExpiredNotices()       — for subs that just transitioned to
 *                                    EXPIRED (auto_renew=false, or renewal
 *                                    failed), send EXPIRED email (dedupe).
 *
 * All three passes are idempotent — running the tick every 10 minutes is
 * fine, running it every minute would still be fine (just wasteful).
 */

import { getSql } from "../../db/client.js";
import { createSmtpTransporter, formatSmtpFrom, getSmtpConfig } from "../../lib/smtp-config.js";
import {
  buildExpiredEmail,
  buildExpiryReminder3dEmail,
  buildRenewFailedInsufficientEmail,
  buildRenewSuccessEmail,
  type CommonRenderContext,
} from "../../services/email/merchantSubscriptionEmailTemplates.js";
import {
  debitMerchantSubscriptionFee,
  isInsufficientMerchantWalletError,
} from "../../lib/merchant-subscription-wallet.js";
import { getWalletSummary } from "../../lib/merchant-wallet-engine.js";
import { buildPlanPurchaseSnapshot } from "../../lib/plan-purchase-snapshot.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const REMINDER_DAYS_BEFORE = 3;
/**
 * Window for the reminder sweep: subs expiring between (now + LOWER) and
 * (now + UPPER). LOWER < 3d catches "should have reminded already but tick was
 * down"; UPPER > 3d ensures a sub whose 3d window falls between two ticks
 * still gets a reminder.
 */
const REMINDER_WINDOW_LOWER_DAYS = 2;
const REMINDER_WINDOW_UPPER_DAYS = 4;

const SUPPORT_EMAIL_DEFAULT = "support@gatimitra.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ymd(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

async function loadMerchantContact(
  sql: ReturnType<typeof getSql>,
  merchantId: number,
  storeId: number
): Promise<{
  email: string | null;
  name: string | null;
  storeName: string;
  storePublicId: string | null;
}> {
  // merchant_parents holds the subscription owner's contact (owner_email +
  // owner_name / parent_name). merchant_stores.parent_id → merchant_parents.id.
  // Fall back to store_email if the parent record has no email.
  const rows = await sql`
    SELECT
      s.store_name,
      s.store_id       AS store_public_id,
      s.store_email,
      mp.owner_name,
      mp.parent_name,
      mp.owner_email
    FROM merchant_stores s
    LEFT JOIN merchant_parents mp ON mp.id = ${merchantId}
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
      }
    | undefined;
  if (!r) return { email: null, name: null, storeName: `Store #${storeId}`, storePublicId: null };
  const emailRaw =
    (r.owner_email && r.owner_email.trim()) || (r.store_email && r.store_email.trim()) || null;
  const nameRaw =
    (r.owner_name && r.owner_name.trim()) || (r.parent_name && r.parent_name.trim()) || "there";
  return {
    email: emailRaw,
    name: nameRaw,
    storeName: String(r.store_name ?? `Store #${storeId}`),
    storePublicId: r.store_public_id ? String(r.store_public_id) : null,
  };
}

async function safeWalletBalance(storeId: number): Promise<number | null> {
  try {
    const s = await getWalletSummary(storeId);
    const bal = Number((s as { available_balance?: number }).available_balance ?? 0);
    return Number.isFinite(bal) ? bal : null;
  } catch {
    return null;
  }
}

/**
 * Send an email + record it in merchant_subscription_notifications.
 * The dedupe_key UNIQUE index prevents duplicate sends across concurrent
 * ticks. If the insert fails with 23505, we KNOW another instance already
 * sent this one — skip the actual SMTP call.
 */
async function sendAndLogNotification(args: {
  subscriptionId: number;
  merchantId: number;
  storeId: number;
  notificationType:
    | "EXPIRY_REMINDER_3D"
    | "RENEW_SUCCESS"
    | "RENEW_FAILED_INSUFFICIENT"
    | "RENEW_FAILED_OTHER"
    | "EXPIRED";
  recipient: string;
  subject: string;
  html: string;
  text: string;
  templateKey: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const sql = getSql();

  // Reserve the dedupe slot FIRST — if someone else already sent this exact
  // notification (concurrent tick, same second), we bail without hitting SMTP.
  try {
    await sql`
      INSERT INTO merchant_subscription_notifications (
        subscription_id, merchant_id, store_id, notification_type,
        channel, recipient, subject, template_key, status, payload, dedupe_key
      ) VALUES (
        ${args.subscriptionId}, ${args.merchantId}, ${args.storeId}, ${args.notificationType},
        'EMAIL', ${args.recipient}, ${args.subject}, ${args.templateKey},
        'SENT', ${JSON.stringify(args.payload ?? {})}::jsonb, ${args.dedupeKey}
      )
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      // Already sent — safe skip.
      return { ok: true, skipped: true };
    }
    throw err;
  }

  // Now actually send. If SMTP fails we UPDATE the row to FAILED with the
  // error message. The reserved dedupe_key stays, which means we won't retry
  // — this is intentional (avoids infinite retry loops for a broken template).
  // Ops can DELETE the failed row to force a retry.
  const cfg = getSmtpConfig();
  if (!cfg.ok) {
    await sql`
      UPDATE merchant_subscription_notifications
      SET status = 'FAILED', error_message = 'smtp_not_configured'
      WHERE dedupe_key = ${args.dedupeKey}
    `;
    return { ok: false, skipped: false, error: "smtp_not_configured" };
  }

  try {
    const transporter = await createSmtpTransporter();
    if (!transporter) throw new Error("smtp_transporter_null");
    await transporter.sendMail({
      from: formatSmtpFrom() ?? cfg.fromEmail,
      to: args.recipient,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, skipped: false };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    await sql`
      UPDATE merchant_subscription_notifications
      SET status = 'FAILED', error_message = ${msg}
      WHERE dedupe_key = ${args.dedupeKey}
    `;
    return { ok: false, skipped: false, error: msg };
  }
}

// ─── PASS 1: Send 3-day reminders ─────────────────────────────────────────────

type ReminderRow = {
  id: number;
  merchant_id: number;
  store_id: number;
  plan_id: number;
  auto_renew: boolean;
  expiry_date: string;
  plan_name: string;
  plan_price: number;
  billing_cycle: string;
  gst_percent: number;
};

async function sendExpiryReminders(): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const sql = getSql();

  const lowerDate = new Date(Date.now() + REMINDER_WINDOW_LOWER_DAYS * 86400_000);
  const upperDate = new Date(Date.now() + REMINDER_WINDOW_UPPER_DAYS * 86400_000);

  const rows = (await sql`
    SELECT
      ms.id, ms.merchant_id, ms.store_id, ms.plan_id, ms.auto_renew,
      COALESCE(ms.next_billing_date, ms.expiry_date, ms.billing_end_at) AS expiry_date,
      p.plan_name, p.price AS plan_price, p.billing_cycle, p.gst_percent
    FROM merchant_subscriptions ms
    JOIN merchant_plans p ON p.id = ms.plan_id
    WHERE ms.subscription_status = 'ACTIVE'
      AND ms.is_active = true
      AND p.price > 0
      AND COALESCE(ms.next_billing_date, ms.expiry_date, ms.billing_end_at)
          BETWEEN ${lowerDate.toISOString()}::timestamptz
              AND ${upperDate.toISOString()}::timestamptz
  `) as unknown as ReminderRow[];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of rows) {
    const contact = await loadMerchantContact(sql, sub.merchant_id, sub.store_id);
    if (!contact.email) {
      failed++;
      continue;
    }

    const expiryDate = new Date(sub.expiry_date);
    const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400_000));
    const walletBalance = await safeWalletBalance(sub.store_id);
    const priceRupees = Number(sub.plan_price ?? 0);
    const willAutoRenew = sub.auto_renew === true && walletBalance != null && walletBalance >= priceRupees;

    const ctx: CommonRenderContext = {
      merchantName: contact.name ?? "there",
      storeName: contact.storeName,
      storeId: contact.storePublicId,
      planName: String(sub.plan_name ?? "Subscription"),
      planPriceRupees: priceRupees,
      billingCycle: String(sub.billing_cycle ?? "MONTHLY"),
      expiryDateIso: expiryDate.toISOString(),
      supportEmail: SUPPORT_EMAIL_DEFAULT,
    };

    const email = buildExpiryReminder3dEmail({
      ...ctx,
      daysRemaining,
      autoRenewEnabled: sub.auto_renew === true,
      walletBalanceRupees: walletBalance,
      willAutoRenew,
    });

    const res = await sendAndLogNotification({
      subscriptionId: sub.id,
      merchantId: sub.merchant_id,
      storeId: sub.store_id,
      notificationType: "EXPIRY_REMINDER_3D",
      recipient: contact.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      templateKey: "expiry_reminder_3d",
      dedupeKey: `reminder_3d_${sub.id}_${ymd(expiryDate)}`,
      payload: { daysRemaining, walletBalance, willAutoRenew, planPriceRupees: priceRupees },
    });

    if (res.skipped) skipped++;
    else if (res.ok) sent++;
    else failed++;
  }

  return { scanned: rows.length, sent, skipped, failed };
}

// ─── PASS 2: Run auto-renewals with logging + email ──────────────────────────

type DueSubRow = {
  id: number;
  merchant_id: number;
  store_id: number;
  plan_id: number;
  auto_renew: boolean;
  expiry_date: string | null;
  next_billing_date: string | null;
  billing_end_at: string | null;
  plan_name: string;
  plan_code: string;
  price: number;
  gst_percent: number;
  billing_cycle: string;
  benefits_json: unknown | null;
};

function gstBreakdown(amount: number, gstPercent: number) {
  const gp = Number.isFinite(gstPercent) && gstPercent >= 0 && gstPercent <= 100 ? gstPercent : 0;
  const subtotalPaise = Math.round(amount * 100);
  const gstAmountPaise = Math.round((subtotalPaise * gp) / 100);
  return { gstPercent: gp, subtotalPaise, gstAmountPaise, totalPaise: subtotalPaise + gstAmountPaise };
}

function computeNextEnd(from: Date, cycle: string): Date {
  const end = new Date(from);
  const c = (cycle || "MONTHLY").toUpperCase().replace(/-/g, "_");
  if (c === "YEARLY") end.setFullYear(end.getFullYear() + 1);
  else if (c === "SEMI_YEARLY" || c === "SEMIYEARLY") end.setMonth(end.getMonth() + 6);
  else if (c === "QUARTERLY") end.setMonth(end.getMonth() + 3);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

async function runAutoRenewals(): Promise<{ processed: number; renewed: number; failedInsufficient: number; failedOther: number }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      ms.id, ms.merchant_id, ms.store_id, ms.plan_id, ms.auto_renew,
      ms.expiry_date, ms.next_billing_date, ms.billing_end_at,
      p.plan_name, p.plan_code, p.price, p.gst_percent, p.billing_cycle, p.benefits_json
    FROM merchant_subscriptions ms
    JOIN merchant_plans p ON p.id = ms.plan_id
    WHERE ms.subscription_status = 'ACTIVE'
      AND ms.is_active = true
      AND ms.auto_renew = true
      AND p.price > 0
      AND COALESCE(ms.next_billing_date, ms.expiry_date, ms.billing_end_at) <= NOW()
  `) as unknown as DueSubRow[];

  let renewed = 0;
  let failedInsufficient = 0;
  let failedOther = 0;

  for (const sub of rows) {
    const billingEnd =
      (sub.next_billing_date ? new Date(sub.next_billing_date) : null) ??
      (sub.billing_end_at ? new Date(sub.billing_end_at) : null) ??
      (sub.expiry_date ? new Date(sub.expiry_date) : null) ??
      new Date();
    const billingEndKey = billingEnd.getTime();

    // Idempotency short-circuit — if we've already attempted for this billing
    // cycle, skip. UNIQUE (subscription_id, billing_end_key) also protects us
    // if a race slips through.
    const existing = await sql`
      SELECT id FROM merchant_subscription_renewal_attempts
      WHERE subscription_id = ${sub.id} AND billing_end_key = ${billingEndKey}
      LIMIT 1
    `;
    if (existing.length > 0) continue;

    const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(sub.price, sub.gst_percent);
    const totalAmount = toRupees(totalPaise);
    const walletBefore = await safeWalletBalance(sub.store_id);
    const contact = await loadMerchantContact(sql, sub.merchant_id, sub.store_id);

    // Attempt the debit.
    let newLedgerId: number | null = null;
    let debitError: Error | null = null;
    try {
      const debit = await debitMerchantSubscriptionFee({
        storeId: sub.store_id,
        subscriptionId: sub.id,
        amount: totalAmount,
        description: `Subscription auto-renew — ${sub.plan_name}`,
        metadata: {
          plan_id: sub.plan_id,
          plan_name: sub.plan_name,
          billing_cycle: sub.billing_cycle,
          gst_percent: gstPercent,
          subtotal_paise: subtotalPaise,
          gst_amount_paise: gstAmountPaise,
          total_paise: totalPaise,
          source: "cron_lifecycle_tick",
        },
        idempotencySuffix: billingEndKey,
      });
      newLedgerId = debit.ledgerId;
    } catch (err) {
      debitError = err as Error;
    }

    if (debitError && isInsufficientMerchantWalletError(debitError)) {
      // Mark sub EXPIRED, log attempt, email merchant.
      await sql`
        UPDATE merchant_subscriptions SET
          subscription_status = 'EXPIRED',
          is_active = false,
          payment_status = 'FAILED',
          last_auto_pay_attempt = NOW(),
          auto_pay_failure_count = COALESCE(auto_pay_failure_count, 0) + 1,
          updated_at = NOW()
        WHERE id = ${sub.id}
      `;

      await sql`
        INSERT INTO merchant_subscription_renewal_attempts (
          subscription_id, merchant_id, store_id, plan_id,
          amount, total_paise, gst_percent, gst_amount_paise,
          status, failure_reason, wallet_balance_before,
          billing_end_key, source, attempted_at, completed_at
        ) VALUES (
          ${sub.id}, ${sub.merchant_id}, ${sub.store_id}, ${sub.plan_id},
          ${totalAmount}, ${totalPaise}, ${gstPercent}, ${gstAmountPaise},
          'FAILED_INSUFFICIENT_WALLET', 'wallet_balance_below_plan_price',
          ${walletBefore}, ${billingEndKey}, 'CRON', NOW(), NOW()
        )
        ON CONFLICT (subscription_id, billing_end_key) DO NOTHING
      `;

      if (contact.email) {
        const ctx: CommonRenderContext = {
          merchantName: contact.name ?? "there",
          storeName: contact.storeName,
          storeId: contact.storePublicId,
          planName: String(sub.plan_name ?? "Subscription"),
          planPriceRupees: totalAmount,
          billingCycle: String(sub.billing_cycle ?? "MONTHLY"),
          expiryDateIso: billingEnd.toISOString(),
          supportEmail: SUPPORT_EMAIL_DEFAULT,
        };
        const email = buildRenewFailedInsufficientEmail({
          ...ctx,
          requiredRupees: totalAmount,
          walletBalanceRupees: walletBefore ?? 0,
        });
        await sendAndLogNotification({
          subscriptionId: sub.id,
          merchantId: sub.merchant_id,
          storeId: sub.store_id,
          notificationType: "RENEW_FAILED_INSUFFICIENT",
          recipient: contact.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          templateKey: "renew_failed_insufficient",
          dedupeKey: `renew_failed_${sub.id}_${billingEndKey}`,
          payload: { required: totalAmount, walletBefore },
        });
      }

      failedInsufficient++;
      continue;
    }

    if (debitError) {
      // Non-wallet failure (DB down, etc.). Log + increment counter but don't
      // mark the sub EXPIRED — a transient DB glitch shouldn't lose the
      // merchant their subscription. Next tick will retry.
      console.error("[merchant_sub_renewal] non-wallet failure", sub.id, debitError.message);
      await sql`
        UPDATE merchant_subscriptions SET
          last_auto_pay_attempt = NOW(),
          auto_pay_failure_count = COALESCE(auto_pay_failure_count, 0) + 1,
          updated_at = NOW()
        WHERE id = ${sub.id}
      `;
      await sql`
        INSERT INTO merchant_subscription_renewal_attempts (
          subscription_id, merchant_id, store_id, plan_id,
          amount, total_paise, gst_percent, gst_amount_paise,
          status, failure_reason, wallet_balance_before,
          billing_end_key, source, attempted_at, completed_at
        ) VALUES (
          ${sub.id}, ${sub.merchant_id}, ${sub.store_id}, ${sub.plan_id},
          ${totalAmount}, ${totalPaise}, ${gstPercent}, ${gstAmountPaise},
          'FAILED_OTHER', ${debitError.message}, ${walletBefore},
          ${billingEndKey}, 'CRON', NOW(), NOW()
        )
        ON CONFLICT (subscription_id, billing_end_key) DO NOTHING
      `;
      failedOther++;
      continue;
    }

    // SUCCESS — extend sub, insert payment row, log attempt, email merchant.
    const renewedFrom = billingEnd.getTime() <= Date.now() ? billingEnd : new Date();
    const newExpiry = computeNextEnd(renewedFrom, sub.billing_cycle);
    const now = new Date();
    const snap = buildPlanPurchaseSnapshot({
      plan_name: sub.plan_name,
      plan_code: sub.plan_code,
      billing_cycle: sub.billing_cycle,
      price: sub.price,
      benefits_json: sub.benefits_json,
    });
    const benefitsJson =
      snap.plan_benefits_snapshot != null
        ? JSON.stringify(snap.plan_benefits_snapshot)
        : null;

    await sql`
      UPDATE merchant_subscriptions SET
        subscription_status = 'ACTIVE',
        payment_status = 'PAID',
        is_active = true,
        start_date = ${renewedFrom.toISOString()},
        expiry_date = ${newExpiry.toISOString()},
        billing_start_at = ${renewedFrom.toISOString()},
        billing_end_at = ${newExpiry.toISOString()},
        last_payment_date = ${now.toISOString()},
        next_billing_date = ${newExpiry.toISOString()},
        next_auto_pay_date = ${newExpiry.toISOString()},
        auto_pay_failure_count = 0,
        last_auto_pay_attempt = ${now.toISOString()},
        plan_name_snapshot = ${snap.plan_name_snapshot},
        plan_code_snapshot = ${snap.plan_code_snapshot},
        billing_cycle_snapshot = ${snap.billing_cycle_snapshot},
        plan_list_price_paise = ${snap.plan_list_price_paise},
        plan_benefits_snapshot = ${benefitsJson}::jsonb,
        updated_at = NOW()
      WHERE id = ${sub.id}
    `;

    // subscription_payments insert (swallowed if table absent — same as legacy path)
    let newPaymentId: number | null = null;
    try {
      const ins = await sql`
        INSERT INTO subscription_payments (
          merchant_id, store_id, subscription_id, plan_id, amount,
          subtotal_paise, gst_percent_applied, gst_amount_paise, total_paise,
          payment_gateway, payment_gateway_id, payment_gateway_response,
          payment_status, payment_date, billing_period_start, billing_period_end, notes,
          plan_name_snapshot, plan_code_snapshot, billing_cycle_snapshot,
          plan_list_price_paise, plan_benefits_snapshot
        ) VALUES (
          ${sub.merchant_id}, ${sub.store_id}, ${sub.id}, ${sub.plan_id}, ${totalAmount},
          ${subtotalPaise}, ${gstPercent}, ${gstAmountPaise}, ${totalPaise},
          'WALLET', ${`wallet_renew_${sub.id}_${billingEndKey}`},
          ${JSON.stringify({ auto_renew: true, ledger_id: newLedgerId })}::jsonb,
          'PAID', ${now.toISOString()}, ${renewedFrom.toISOString()}, ${newExpiry.toISOString()},
          ${`Auto-renew from wallet — ${sub.plan_name}`},
          ${snap.plan_name_snapshot}, ${snap.plan_code_snapshot}, ${snap.billing_cycle_snapshot},
          ${snap.plan_list_price_paise}, ${benefitsJson}::jsonb
        )
        RETURNING id
      `;
      newPaymentId = Number((ins[0] as { id: number }).id);
    } catch (err) {
      console.warn("[merchant_sub_renewal] payment insert failed (non-fatal)", (err as Error)?.message);
    }

    await sql`
      INSERT INTO merchant_subscription_renewal_attempts (
        subscription_id, merchant_id, store_id, plan_id,
        amount, total_paise, gst_percent, gst_amount_paise,
        status, wallet_balance_before,
        new_payment_id, new_wallet_ledger_id, new_expiry_date,
        billing_end_key, source, attempted_at, completed_at
      ) VALUES (
        ${sub.id}, ${sub.merchant_id}, ${sub.store_id}, ${sub.plan_id},
        ${totalAmount}, ${totalPaise}, ${gstPercent}, ${gstAmountPaise},
        'SUCCESS', ${walletBefore},
        ${newPaymentId}, ${newLedgerId}, ${newExpiry.toISOString()},
        ${billingEndKey}, 'CRON', NOW(), NOW()
      )
      ON CONFLICT (subscription_id, billing_end_key) DO NOTHING
    `;

    if (contact.email) {
      const walletAfter = await safeWalletBalance(sub.store_id);
      const ctx: CommonRenderContext = {
        merchantName: contact.name ?? "there",
        storeName: contact.storeName,
        storeId: contact.storePublicId,
        planName: String(sub.plan_name ?? "Subscription"),
        planPriceRupees: totalAmount,
        billingCycle: String(sub.billing_cycle ?? "MONTHLY"),
        expiryDateIso: newExpiry.toISOString(),
        supportEmail: SUPPORT_EMAIL_DEFAULT,
      };
      const email = buildRenewSuccessEmail({
        ...ctx,
        amountChargedRupees: totalAmount,
        debitedFromWalletRupees: totalAmount,
        newExpiryDateIso: newExpiry.toISOString(),
        walletBalanceAfterRupees: walletAfter,
        paymentId: newPaymentId,
      });
      await sendAndLogNotification({
        subscriptionId: sub.id,
        merchantId: sub.merchant_id,
        storeId: sub.store_id,
        notificationType: "RENEW_SUCCESS",
        recipient: contact.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        templateKey: "renew_success",
        dedupeKey: `renew_success_${sub.id}_${billingEndKey}`,
        payload: { amountChargedRupees: totalAmount, newExpiryDateIso: newExpiry.toISOString() },
      });
    }

    renewed++;
  }

  return { processed: rows.length, renewed, failedInsufficient, failedOther };
}

// ─── PASS 3: Notify newly-expired subs ────────────────────────────────────────

async function sendExpiredNotices(): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const sql = getSql();

  // Subs that transitioned to EXPIRED in the last hour AND haven't been
  // notified yet (dedupe_key catches repeats). Time window is loose so a
  // slow tick doesn't miss anyone.
  const rows = (await sql`
    SELECT
      ms.id, ms.merchant_id, ms.store_id, ms.plan_id,
      COALESCE(ms.expiry_date, ms.billing_end_at) AS expiry_date,
      p.plan_name, p.price, p.billing_cycle
    FROM merchant_subscriptions ms
    JOIN merchant_plans p ON p.id = ms.plan_id
    WHERE ms.subscription_status = 'EXPIRED'
      AND ms.updated_at >= NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM merchant_subscription_notifications n
        WHERE n.subscription_id = ms.id
          AND n.notification_type = 'EXPIRED'
          AND n.status = 'SENT'
      )
  `) as unknown as Array<{
    id: number;
    merchant_id: number;
    store_id: number;
    plan_id: number;
    expiry_date: string;
    plan_name: string;
    price: number;
    billing_cycle: string;
  }>;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of rows) {
    const contact = await loadMerchantContact(sql, sub.merchant_id, sub.store_id);
    if (!contact.email) {
      failed++;
      continue;
    }

    const expiryDate = new Date(sub.expiry_date);
    const ctx: CommonRenderContext = {
      merchantName: contact.name ?? "there",
      storeName: contact.storeName,
      storeId: contact.storePublicId,
      planName: String(sub.plan_name ?? "Subscription"),
      planPriceRupees: Number(sub.price ?? 0),
      billingCycle: String(sub.billing_cycle ?? "MONTHLY"),
      expiryDateIso: expiryDate.toISOString(),
      supportEmail: SUPPORT_EMAIL_DEFAULT,
    };
    const email = buildExpiredEmail(ctx);

    const res = await sendAndLogNotification({
      subscriptionId: sub.id,
      merchantId: sub.merchant_id,
      storeId: sub.store_id,
      notificationType: "EXPIRED",
      recipient: contact.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      templateKey: "expired",
      dedupeKey: `expired_${sub.id}`,
      payload: { expiryDateIso: expiryDate.toISOString() },
    });

    if (res.skipped) skipped++;
    else if (res.ok) sent++;
    else failed++;
  }

  return { scanned: rows.length, sent, skipped, failed };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export type LifecycleTickResult = {
  reminders: { scanned: number; sent: number; skipped: number; failed: number };
  renewals: { processed: number; renewed: number; failedInsufficient: number; failedOther: number };
  expired: { scanned: number; sent: number; skipped: number; failed: number };
};

/**
 * Full lifecycle tick — reminders + renewals + expired notices. Safe to run
 * on any cadence; idempotent per (subscription, cycle) via dedupe keys +
 * UNIQUE constraints.
 */
export async function runMerchantSubscriptionLifecycleTick(): Promise<LifecycleTickResult> {
  const reminders = await sendExpiryReminders();
  const renewals = await runAutoRenewals();
  const expired = await sendExpiredNotices();
  return { reminders, renewals, expired };
}
