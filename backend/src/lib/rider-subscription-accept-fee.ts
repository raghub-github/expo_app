/**
 * Accept-linked daily GMitra Max fee.
 *
 * With auto-renew ON and billing_cycle = daily, charge once per IST calendar
 * day on the rider's first successful order accept. Cron must not charge daily.
 */

import { getSql } from "../db/client.js";
import {
  addSubscriptionBillingPeriod,
  fetchLastSubscriptionFeeAt,
} from "./rider-subscription-schedule.js";
import { debitRiderSubscriptionFee } from "./rider-subscription-wallet.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function priceWithGst(subtotal: number, gstPercent: number): { total: number } {
  const base = round2(Math.max(0, subtotal));
  const pct = Number.isFinite(gstPercent) ? Math.max(0, gstPercent) : 0;
  const gstAmount = round2((base * pct) / 100);
  return { total: round2(base + gstAmount) };
}

export function toIstDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Time-based renewal cron applies only to non-daily cycles. */
export function isTimeBasedSubscriptionRenewalCycle(cycle: string): boolean {
  return String(cycle).toLowerCase() !== "daily";
}

export function alreadyChargedOnIstDate(args: {
  todayIst: string;
  lastAcceptFeeOnDate: string | null | undefined;
  lastDeductionAt: Date | null;
  lastFeeLedgerAt: Date | null;
}): boolean {
  const today = args.todayIst;
  if (args.lastAcceptFeeOnDate && String(args.lastAcceptFeeOnDate).slice(0, 10) === today) {
    return true;
  }
  if (args.lastDeductionAt && toIstDateStr(args.lastDeductionAt) === today) {
    return true;
  }
  if (args.lastFeeLedgerAt && toIstDateStr(args.lastFeeLedgerAt) === today) {
    return true;
  }
  return false;
}

function parseDbDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnlyStr(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return toIstDateStr(value);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = parseDbDate(raw);
  return parsed ? toIstDateStr(parsed) : null;
}

type ClaimedDailySub = {
  id: number;
  planId: number;
  planName: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  amountPaid: number;
};

/**
 * Best-effort daily fee on first accept of the IST day.
 * Safe under concurrent accepts via atomic claim of last_accept_fee_on_date.
 */
export async function maybeChargeDailySubscriptionOnFirstAccept(
  riderId: number
): Promise<{ charged: boolean; skipped: boolean; reason?: string }> {
  if (!Number.isFinite(riderId) || riderId <= 0) {
    return { charged: false, skipped: true, reason: "invalid_rider" };
  }

  const sql = getSql();
  const todayIst = toIstDateStr();

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await sql`
      SELECT
        rs.id,
        rs.plan_id,
        rs.billing_cycle,
        rs.auto_wallet_deduction,
        rs.last_accept_fee_on_date,
        rs.last_deduction_at,
        rs.subtotal_amount,
        rs.gst_percent_applied,
        rs.gst_amount,
        rs.amount_paid,
        p.name AS plan_name
      FROM rider_subscriptions rs
      JOIN subscription_plans p ON p.id = rs.plan_id
      WHERE rs.rider_id = ${riderId}
        AND rs.status = 'active'
        AND (
          rs.end_date > NOW()
          OR COALESCE(rs.auto_wallet_deduction, FALSE) = TRUE
        )
      ORDER BY rs.created_at DESC
      LIMIT 1
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") {
      return { charged: false, skipped: true, reason: "schema_missing" };
    }
    throw err;
  }

  const pre = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!pre) return { charged: false, skipped: true, reason: "no_active_subscription" };

  const cycle = String(pre.billing_cycle ?? "");
  const autoOn = Boolean(pre.auto_wallet_deduction);
  if (cycle !== "daily" || !autoOn) {
    return { charged: false, skipped: true, reason: "not_daily_auto" };
  }

  const preLastAccept = dateOnlyStr(pre.last_accept_fee_on_date);
  const preLastDeduction = parseDbDate(pre.last_deduction_at);
  const lastFeeAt = await fetchLastSubscriptionFeeAt(riderId);

  if (
    alreadyChargedOnIstDate({
      todayIst,
      lastAcceptFeeOnDate: preLastAccept,
      lastDeductionAt: preLastDeduction,
      lastFeeLedgerAt: lastFeeAt,
    })
  ) {
    if (preLastAccept !== todayIst) {
      try {
        await sql`
          UPDATE rider_subscriptions
          SET
            last_accept_fee_on_date = ${todayIst}::date,
            updated_at = NOW()
          WHERE id = ${Number(pre.id)}
            AND rider_id = ${riderId}
            AND (last_accept_fee_on_date IS DISTINCT FROM ${todayIst}::date)
        `;
      } catch {
        // best-effort sync
      }
    }
    return { charged: false, skipped: true, reason: "already_charged_today" };
  }

  // Atomic claim: only one concurrent accept wins the day.
  let claimed: ClaimedDailySub | null = null;
  try {
    const claimedRows = await sql`
      UPDATE rider_subscriptions
      SET
        last_accept_fee_on_date = ${todayIst}::date,
        updated_at = NOW()
      WHERE id = ${Number(pre.id)}
        AND rider_id = ${riderId}
        AND status = 'active'
        AND billing_cycle = 'daily'
        AND COALESCE(auto_wallet_deduction, FALSE) = TRUE
        AND (
          last_accept_fee_on_date IS NULL
          OR last_accept_fee_on_date < ${todayIst}::date
        )
      RETURNING
        id,
        plan_id,
        subtotal_amount,
        gst_percent_applied,
        gst_amount,
        amount_paid
    `;
    const crow = (Array.isArray(claimedRows) ? claimedRows[0] : null) as
      | Record<string, unknown>
      | undefined;
    if (crow) {
      claimed = {
        id: Number(crow.id),
        planId: Number(crow.plan_id ?? pre.plan_id),
        planName: String(pre.plan_name ?? "Subscription"),
        subtotal: Number(crow.subtotal_amount ?? pre.subtotal_amount ?? 0),
        gstPercent:
          crow.gst_percent_applied != null
            ? Number(crow.gst_percent_applied)
            : pre.gst_percent_applied != null
              ? Number(pre.gst_percent_applied)
              : 18,
        gstAmount: Number(crow.gst_amount ?? pre.gst_amount ?? 0),
        amountPaid: Number(crow.amount_paid ?? pre.amount_paid ?? 0),
      };
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") {
      return { charged: false, skipped: true, reason: "schema_missing" };
    }
    throw err;
  }

  if (!claimed) {
    return { charged: false, skipped: true, reason: "already_claimed_today" };
  }

  let total = Number(claimed.amountPaid);
  if (!(total > 0)) {
    const gst = priceWithGst(claimed.subtotal > 0 ? claimed.subtotal : 0, claimed.gstPercent);
    total = gst.total > 0 ? gst.total : claimed.subtotal + claimed.gstAmount;
  }
  if (!(total > 0)) {
    try {
      const priceRows = await sql`
        SELECT amount, gst_percent
        FROM subscription_plan_prices
        WHERE plan_id = ${claimed.planId}
          AND billing_cycle = 'daily'::public.subscription_billing_cycle
          AND is_active = true
        LIMIT 1
      `;
      const pr = (Array.isArray(priceRows) ? priceRows[0] : null) as
        | { amount?: unknown; gst_percent?: unknown }
        | undefined;
      if (pr) {
        total = priceWithGst(
          Number(pr.amount ?? 0),
          pr.gst_percent != null ? Number(pr.gst_percent) : 18
        ).total;
      }
    } catch {
      // keep total
    }
  }

  if (!(total > 0)) {
    return { charged: false, skipped: true, reason: "zero_amount" };
  }

  const ref = `rider_sub_day:${claimed.id}:${todayIst}`;

  // Idempotent if a previous attempt already wrote this ref.
  try {
    const existing = await sql`
      SELECT id FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND ref = ${ref}
      LIMIT 1
    `;
    if (Array.isArray(existing) && existing.length > 0) {
      return { charged: false, skipped: true, reason: "ref_exists" };
    }
  } catch {
    // continue; unique index may not cover this entry type
  }

  try {
    await debitRiderSubscriptionFee({
      riderId,
      amount: total,
      ref,
      description: `${claimed.planName} daily fee (first accept ${todayIst})`,
      metadata: {
        subscriptionId: claimed.id,
        planId: claimed.planId,
        billingCycle: "daily",
        trigger: "first_accept",
        istDate: todayIst,
        renewal: true,
      },
    });
  } catch (err) {
    // Release claim so a later accept can retry the fee.
    try {
      await sql`
        UPDATE rider_subscriptions
        SET
          last_accept_fee_on_date = NULL,
          updated_at = NOW()
        WHERE id = ${claimed.id}
          AND rider_id = ${riderId}
          AND last_accept_fee_on_date = ${todayIst}::date
      `;
    } catch {
      // ignore
    }
    throw err;
  }

  const chargedAt = new Date();
  const endIso = addSubscriptionBillingPeriod(chargedAt, "daily").toISOString();

  try {
    await sql`
      UPDATE rider_subscriptions
      SET
        last_deduction_at = ${chargedAt.toISOString()},
        last_accept_fee_on_date = ${todayIst}::date,
        next_deduction_at = NULL,
        end_date = ${endIso},
        amount_paid = ${total},
        updated_at = NOW()
      WHERE id = ${claimed.id}
        AND rider_id = ${riderId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") {
      await sql`
        UPDATE rider_subscriptions
        SET
          last_deduction_at = ${chargedAt.toISOString()},
          next_deduction_at = NULL,
          end_date = ${endIso},
          amount_paid = ${total},
          updated_at = NOW()
        WHERE id = ${claimed.id}
          AND rider_id = ${riderId}
      `;
    } else {
      throw err;
    }
  }

  return { charged: true, skipped: false };
}
