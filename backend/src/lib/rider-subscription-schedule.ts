/**
 * Single source of truth for rider subscription renewal / expiry times.
 * Always derived from wallet_ledger subscription_fee timestamps when auto-wallet is on.
 */

import { getSql } from "../db/client.js";

export type SubscriptionBillingCycle = "daily" | "monthly" | "semi_yearly" | "yearly";

export type RiderSubscriptionSchedule = {
  lastDeductionAt: Date | null;
  nextRenewalAt: Date;
  expiresAt: Date;
};

export function addSubscriptionBillingPeriod(
  start: Date,
  cycle: SubscriptionBillingCycle
): Date {
  const end = new Date(start);
  switch (cycle) {
    case "daily":
      end.setDate(end.getDate() + 1);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "semi_yearly":
      end.setMonth(end.getMonth() + 6);
      break;
    case "yearly":
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export async function fetchLastSubscriptionFeeAt(riderId: number): Promise<Date | null> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT created_at
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND entry_type = 'subscription_fee'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    const row = (rows[0] as { created_at?: Date | string } | undefined)?.created_at;
    if (!row) return null;
    const parsed = row instanceof Date ? row : new Date(String(row));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export async function fetchSubscriptionLastDeductionAt(
  riderId: number,
  subscriptionId?: number | null
): Promise<Date | null> {
  const sql = getSql();
  try {
    const rows =
      subscriptionId != null && subscriptionId > 0
        ? await sql`
            SELECT last_deduction_at
            FROM rider_subscriptions
            WHERE id = ${subscriptionId}
              AND rider_id = ${riderId}
            LIMIT 1
          `
        : await sql`
            SELECT last_deduction_at
            FROM rider_subscriptions
            WHERE rider_id = ${riderId}
              AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
          `;
    const raw = (rows[0] as { last_deduction_at?: Date | string | null } | undefined)
      ?.last_deduction_at;
    if (raw == null) return null;
    const parsed = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function advanceSubscriptionBillingFrom(
  lastDeduction: Date,
  cycle: SubscriptionBillingCycle,
  now = new Date()
): Date {
  let next = addSubscriptionBillingPeriod(lastDeduction, cycle);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 400) {
    next = addSubscriptionBillingPeriod(next, cycle);
    guard += 1;
  }
  return next;
}

export async function resolveRiderSubscriptionSchedule(args: {
  riderId: number;
  billingCycle: SubscriptionBillingCycle;
  autoWalletDeduction: boolean;
  fallbackStart?: Date | null;
  subscriptionId?: number | null;
}): Promise<RiderSubscriptionSchedule> {
  const now = new Date();
  const fallbackStart = args.fallbackStart ?? null;

  if (!args.autoWalletDeduction) {
    const anchor = fallbackStart && !Number.isNaN(fallbackStart.getTime()) ? fallbackStart : now;
    const expiresAt = addSubscriptionBillingPeriod(anchor, args.billingCycle);
    return { lastDeductionAt: null, nextRenewalAt: expiresAt, expiresAt };
  }

  const lastFeeAt = await fetchLastSubscriptionFeeAt(args.riderId);
  const subscriptionLastAt = await fetchSubscriptionLastDeductionAt(
    args.riderId,
    args.subscriptionId
  );
  const lastDeduction =
    lastFeeAt ??
    subscriptionLastAt ??
    (fallbackStart && !Number.isNaN(fallbackStart.getTime()) ? fallbackStart : null);

  if (!lastDeduction) {
    const expiresAt = addSubscriptionBillingPeriod(now, args.billingCycle);
    return { lastDeductionAt: null, nextRenewalAt: expiresAt, expiresAt };
  }

  const nextRenewalAt = advanceSubscriptionBillingFrom(lastDeduction, args.billingCycle, now);
  return {
    lastDeductionAt: lastDeduction,
    nextRenewalAt,
    expiresAt: nextRenewalAt,
  };
}

export async function persistRiderSubscriptionSchedule(args: {
  subscriptionId: number;
  riderId: number;
  schedule: RiderSubscriptionSchedule;
}): Promise<void> {
  const sql = getSql();
  const { schedule } = args;
  const lastIso = schedule.lastDeductionAt?.toISOString() ?? null;
  const nextIso = schedule.nextRenewalAt.toISOString();
  const endIso = schedule.expiresAt.toISOString();

  try {
    await sql`
      UPDATE rider_subscriptions
      SET
        last_deduction_at = ${lastIso},
        next_deduction_at = ${nextIso},
        end_date = ${endIso},
        updated_at = NOW()
      WHERE id = ${args.subscriptionId}
        AND rider_id = ${args.riderId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    await sql`
      UPDATE rider_subscriptions
      SET
        next_deduction_at = ${nextIso},
        end_date = ${endIso},
        updated_at = NOW()
      WHERE id = ${args.subscriptionId}
        AND rider_id = ${args.riderId}
    `;
  }
}
