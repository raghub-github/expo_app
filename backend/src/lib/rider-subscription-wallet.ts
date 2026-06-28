/**
 * Wallet-based GMitra Max subscription: debits, negative balance cap, dispatch restriction.
 */

import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { riderWallet } from "../db/schema.js";
import { splitWalletNegativeBalance } from "./rider-wallet-balance-split.js";

export const MAX_SUBSCRIPTION_NEGATIVE_BALANCE = 35;
export const SUBSCRIPTION_INCOME_FREEZE_DAYS = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Postgres rows may return timestamptz as string depending on driver/config. */
function parseDbDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoTimestamp(value: unknown): string | null {
  return parseDbDate(value)?.toISOString() ?? null;
}

export type RiderSubscriptionDuesSnapshot = {
  walletBalance: number;
  subscriptionWalletNegative: number;
  penaltyWalletNegative: number;
  duesOutstanding: number;
  totalDue: number;
  dispatchBlocked: boolean;
  penaltyStreakDays: number;
  lastIncomeAt: string | null;
};

export type RiderSubscriptionAlertBanner = {
  visible: boolean;
  variant: "warning" | "restricted";
  reasonCode:
    | "none"
    | "negative_wallet"
    | "dues_outstanding"
    | "negative_limit"
    | "dispatch_blocked";
  title: string;
  subtitle: string;
  totalDue: number;
  payableNow: number;
  payButtonLabel: string;
  canPayFromWallet: boolean;
  walletBalance: number;
  duesOutstanding: number;
  dispatchBlocked: boolean;
  negativeLimit: number;
  incomeFreezeDays: number;
  penaltyStreakDays: number;
};

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function todayIstDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function yesterdayIstDateStr(): string {
  const d = new Date(`${todayIstDateStr()}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function buildRiderSubscriptionAlertBanner(
  snapshot: RiderSubscriptionDuesSnapshot
): RiderSubscriptionAlertBanner {
  const base = {
    visible: false as const,
    variant: "warning" as const,
    reasonCode: "none" as const,
    title: "",
    subtitle: "",
    totalDue: snapshot.totalDue,
    payableNow: 0,
    payButtonLabel: "",
    canPayFromWallet: false,
    walletBalance: snapshot.walletBalance,
    duesOutstanding: snapshot.duesOutstanding,
    dispatchBlocked: snapshot.dispatchBlocked,
    negativeLimit: MAX_SUBSCRIPTION_NEGATIVE_BALANCE,
    incomeFreezeDays: SUBSCRIPTION_INCOME_FREEZE_DAYS,
    penaltyStreakDays: snapshot.penaltyStreakDays,
  };

  const {
    walletBalance,
    subscriptionWalletNegative,
    duesOutstanding,
    totalDue,
    dispatchBlocked,
    penaltyStreakDays,
  } = snapshot;
  if (totalDue <= 0 && !dispatchBlocked && subscriptionWalletNegative <= 0 && duesOutstanding <= 0) {
    return base;
  }

  const payableNow =
    walletBalance > 0 ? round2(Math.min(walletBalance, totalDue)) : 0;
  const payButtonLabel =
    totalDue > 0 ? `Pay ₹${formatInr(totalDue)}` : "Pay Now";

  if (dispatchBlocked) {
    let subtitle: string;
    if (
      duesOutstanding > 0 &&
      subscriptionWalletNegative >= MAX_SUBSCRIPTION_NEGATIVE_BALANCE
    ) {
      subtitle = `Subscription penalty for ${penaltyStreakDays} days. Clear ₹${formatInr(totalDue)} to go online and receive orders again.`;
    } else if (subscriptionWalletNegative >= MAX_SUBSCRIPTION_NEGATIVE_BALANCE) {
      subtitle = `Subscription wallet at −₹${formatInr(subscriptionWalletNegative)}. Clear ₹${formatInr(totalDue)} to receive orders again.`;
    } else if (duesOutstanding > 0) {
      subtitle = `₹${formatInr(duesOutstanding)} subscription fee outstanding. Clear ₹${formatInr(totalDue)} to resume orders.`;
    } else {
      subtitle = `Clear ₹${formatInr(totalDue)} subscription dues to resume receiving orders.`;
    }

    return {
      ...base,
      visible: true,
      variant: "restricted",
      reasonCode: "dispatch_blocked",
      title: "Duty Stop Due to Subscription Penalty",
      subtitle,
      totalDue,
      payableNow,
      payButtonLabel,
      canPayFromWallet: payableNow > 0,
      dispatchBlocked: true,
    };
  }

  const hasSubscriptionPenalty = totalDue > 0 || subscriptionWalletNegative > 0 || duesOutstanding > 0;

  if (subscriptionWalletNegative >= MAX_SUBSCRIPTION_NEGATIVE_BALANCE) {
    return {
      ...base,
      visible: true,
      variant: "warning",
      reasonCode: "negative_limit",
      title: "Subscription Penalty Due",
      subtitle: `Subscription balance −₹${formatInr(subscriptionWalletNegative)} (day ${Math.max(penaltyStreakDays, 1)} of ${SUBSCRIPTION_INCOME_FREEZE_DAYS}). Total due ₹${formatInr(totalDue)}.`,
      totalDue,
      payableNow,
      payButtonLabel,
      canPayFromWallet: payableNow > 0,
    };
  }

  if (subscriptionWalletNegative > 0) {
    const dayLabel = Math.max(penaltyStreakDays, 1);
    const subtitle =
      duesOutstanding > 0
        ? `Day ${dayLabel} — subscription wallet −₹${formatInr(subscriptionWalletNegative)} · Outstanding ₹${formatInr(duesOutstanding)} · Total ₹${formatInr(totalDue)}.`
        : `Day ${dayLabel} — subscription wallet −₹${formatInr(subscriptionWalletNegative)}. Total due ₹${formatInr(totalDue)}.`;

    return {
      ...base,
      visible: true,
      variant: "warning",
      reasonCode: "negative_wallet",
      title: "Subscription Penalty Due",
      subtitle,
      totalDue,
      payableNow,
      payButtonLabel,
      canPayFromWallet: payableNow > 0,
    };
  }

  if (duesOutstanding > 0) {
    return {
      ...base,
      visible: true,
      variant: "warning",
      reasonCode: "dues_outstanding",
      title: "Subscription Penalty Due",
      subtitle: `Day ${Math.max(penaltyStreakDays, 1)} — ₹${formatInr(duesOutstanding)} could not be deducted. Total due ₹${formatInr(totalDue)}.`,
      totalDue,
      payableNow,
      payButtonLabel,
      canPayFromWallet: payableNow > 0,
    };
  }

  if (hasSubscriptionPenalty && totalDue > 0) {
    return {
      ...base,
      visible: true,
      variant: "warning",
      reasonCode: "dues_outstanding",
      title: "Subscription Penalty Due",
      subtitle: `Total subscription due ₹${formatInr(totalDue)}.`,
      totalDue,
      payableNow,
      payButtonLabel,
      canPayFromWallet: payableNow > 0,
    };
  }

  return base;
}

export async function readRiderWalletBalance(riderId: number): Promise<number> {
  const sql = getSql();
  await sql`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;
  const rows = await sql`
    SELECT COALESCE(total_balance, 0) AS bal
    FROM rider_wallet
    WHERE rider_id = ${riderId}
    LIMIT 1
  `;
  return round2(Number((rows[0] as { bal?: unknown })?.bal ?? 0));
}

/** DB trigger may not handle subscription_fee on older deployments — sync wallet when needed. */
async function ensureWalletBalanceAfterDebit(
  riderId: number,
  expectedAfter: number
): Promise<number> {
  const expected = round2(expectedAfter);
  const actual = await readRiderWalletBalance(riderId);
  if (Math.abs(actual - expected) <= 0.009) return actual;

  const sql = getSql();
  await sql`
    UPDATE rider_wallet
    SET total_balance = ${expected.toFixed(2)}, last_updated_at = NOW()
    WHERE rider_id = ${riderId}
  `;
  return expected;
}

async function readRiderDuesMeta(riderId: number): Promise<{
  duesOutstanding: number;
  dispatchBlocked: boolean;
  lastIncomeAt: Date | null;
  penaltyStreakDays: number;
  penaltyLastDate: string | null;
}> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        COALESCE(subscription_dues_outstanding, 0) AS dues_outstanding,
        COALESCE(subscription_dispatch_blocked, FALSE) AS dispatch_blocked,
        last_rider_income_at,
        COALESCE(subscription_penalty_streak_days, 0) AS penalty_streak_days,
        subscription_penalty_last_date::text AS penalty_last_date
      FROM riders
      WHERE id = ${riderId}
      LIMIT 1
    `;
    const row = rows[0] as {
      dues_outstanding?: unknown;
      dispatch_blocked?: unknown;
      last_rider_income_at?: Date | null;
      penalty_streak_days?: unknown;
      penalty_last_date?: string | null;
    } | undefined;
    return {
      duesOutstanding: round2(Number(row?.dues_outstanding ?? 0)),
      dispatchBlocked: Boolean(row?.dispatch_blocked),
      lastIncomeAt: parseDbDate(row?.last_rider_income_at),
      penaltyStreakDays: Number(row?.penalty_streak_days ?? 0),
      penaltyLastDate: row?.penalty_last_date?.slice(0, 10) ?? null,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    return {
      duesOutstanding: 0,
      dispatchBlocked: false,
      lastIncomeAt: null,
      penaltyStreakDays: 0,
      penaltyLastDate: null,
    };
  }
}

export async function bumpSubscriptionPenaltyStreak(riderId: number): Promise<number> {
  const sql = getSql();
  const today = todayIstDateStr();
  const yesterday = yesterdayIstDateStr();
  try {
    const meta = await readRiderDuesMeta(riderId);
    if (meta.penaltyLastDate === today) return meta.penaltyStreakDays;

    const next =
      meta.penaltyLastDate === yesterday ? Math.max(1, meta.penaltyStreakDays + 1) : 1;

    await sql`
      UPDATE riders
      SET
        subscription_penalty_streak_days = ${next},
        subscription_penalty_last_date = ${today}::date,
        updated_at = NOW()
      WHERE id = ${riderId}
    `;
    return next;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    return 0;
  }
}

async function resetSubscriptionPenaltyStreak(riderId: number): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE riders
      SET
        subscription_penalty_streak_days = 0,
        subscription_penalty_last_date = NULL,
        updated_at = NOW()
      WHERE id = ${riderId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
  }
}

export async function forceRiderOffDutyForSubscriptionPenalty(riderId: number): Promise<void> {
  const { desc, eq } = await import("drizzle-orm");
  const { getDb } = await import("../db/client.js");
  const { dutyLogs } = await import("../db/schema.js");
  const { recordRiderDutyLog } = await import("./rider-duty-log.service.js");

  const db = getDb();
  const latest = await db
    .select({ status: dutyLogs.status })
    .from(dutyLogs)
    .where(eq(dutyLogs.riderId, riderId))
    .orderBy(desc(dutyLogs.timestamp))
    .limit(1);

  if (latest[0]?.status !== "ON") return;

  await recordRiderDutyLog({
    riderId,
    status: "AUTO_OFF",
    serviceTypes: [],
    source: "system",
    metadata: { reason: "subscription_dispatch_blocked" },
  });
}

export function computeTotalSubscriptionDue(
  subscriptionWalletNegative: number,
  duesOutstanding: number
): number {
  return round2(duesOutstanding + Math.max(0, subscriptionWalletNegative));
}

async function readRiderWalletRowForSplit(riderId: number) {
  const db = getDb();
  const [wallet] = await db
    .select()
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);
  return wallet ?? null;
}

export async function getRiderSubscriptionDuesSnapshot(
  riderId: number
): Promise<RiderSubscriptionDuesSnapshot & { alertBanner: RiderSubscriptionAlertBanner }> {
  await refreshRiderSubscriptionDispatchBlock(riderId);
  const [walletBalance, meta, walletRow] = await Promise.all([
    readRiderWalletBalance(riderId),
    readRiderDuesMeta(riderId),
    readRiderWalletRowForSplit(riderId),
  ]);
  const split = splitWalletNegativeBalance(walletBalance, walletRow, {
    subscriptionDuesOutstanding: meta.duesOutstanding,
  });
  const snapshot: RiderSubscriptionDuesSnapshot = {
    walletBalance,
    subscriptionWalletNegative: split.subscriptionNegative,
    penaltyWalletNegative: split.penaltyNegative,
    duesOutstanding: meta.duesOutstanding,
    totalDue: computeTotalSubscriptionDue(
      split.subscriptionNegative,
      meta.duesOutstanding
    ),
    dispatchBlocked: meta.dispatchBlocked,
    penaltyStreakDays: meta.penaltyStreakDays,
    lastIncomeAt: toIsoTimestamp(meta.lastIncomeAt),
  };
  return {
    ...snapshot,
    alertBanner: buildRiderSubscriptionAlertBanner(snapshot),
  };
}

export async function isRiderSubscriptionDispatchBlocked(riderId: number): Promise<boolean> {
  const meta = await readRiderDuesMeta(riderId);
  return meta.dispatchBlocked;
}

/** Ledger stores positive amounts; entry_type determines credit vs debit. */
async function insertWalletEntry(input: {
  riderId: number;
  entryType: "subscription_fee";
  amount: number;
  balanceAfter: number;
  ref: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  const storedAmount = round2(Math.abs(input.amount));
  if (storedAmount <= 0) return;

  const ledgerBalance =
    input.balanceAfter >= 0 ? input.balanceAfter.toFixed(2) : null;

  try {
    await sql`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        service_type,
        ref,
        ref_type,
        description,
        metadata,
        performed_by_type
      ) VALUES (
        ${input.riderId},
        ${input.entryType},
        ${storedAmount.toFixed(2)},
        ${ledgerBalance},
        NULL,
        ${input.ref},
        'subscription',
        ${input.description},
        ${JSON.stringify(input.metadata ?? {})}::jsonb,
        'system'
      )
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    await sql`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata
      ) VALUES (
        ${input.riderId},
        ${input.entryType},
        ${storedAmount.toFixed(2)},
        ${ledgerBalance},
        ${input.ref},
        'subscription',
        ${input.description},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;
  }
}

/** Visible ledger row without changing wallet (trigger debit is reverted). */
export async function recordSubscriptionFeeLedgerOnly(args: {
  riderId: number;
  amount: number;
  ref: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const amount = round2(args.amount);
  if (amount <= 0) return;
  const balanceBefore = await readRiderWalletBalance(args.riderId);
  await insertWalletEntry({
    riderId: args.riderId,
    entryType: "subscription_fee",
    amount,
    balanceAfter: balanceBefore,
    ref: args.ref,
    description: args.description,
    metadata: { ...args.metadata, ledgerOnly: true },
  });
  await ensureWalletBalanceAfterDebit(args.riderId, balanceBefore);
}

/** Debit subscription fee from wallet, allowing balance down to -₹35; excess accrues as outstanding. */
export async function debitRiderSubscriptionFee(args: {
  riderId: number;
  amount: number;
  ref: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<{ debited: number; addedToOutstanding: number; balanceAfter: number }> {
  const amount = round2(args.amount);
  if (amount <= 0) {
    const balanceAfter = await readRiderWalletBalance(args.riderId);
    return { debited: 0, addedToOutstanding: 0, balanceAfter };
  }

  const sql = getSql();
  const balance = await readRiderWalletBalance(args.riderId);
  const floor = -MAX_SUBSCRIPTION_NEGATIVE_BALANCE;
  const targetBalance = round2(balance - amount);

  let debited = amount;
  let addedToOutstanding = 0;
  let balanceAfter = targetBalance;

  if (targetBalance < floor) {
    debited = round2(Math.max(0, balance - floor));
    addedToOutstanding = round2(amount - debited);
    balanceAfter = round2(balance - debited);
  }

  if (debited > 0) {
    await insertWalletEntry({
      riderId: args.riderId,
      entryType: "subscription_fee",
      amount: debited,
      balanceAfter,
      ref: args.ref,
      description: args.description,
      metadata: args.metadata,
    });
    balanceAfter = await ensureWalletBalanceAfterDebit(args.riderId, balanceAfter);
  }

  if (addedToOutstanding > 0) {
    await recordSubscriptionFeeLedgerOnly({
      riderId: args.riderId,
      amount: addedToOutstanding,
      ref: `${args.ref}:dues`,
      description: `${args.description} (added to subscription dues)`,
      metadata: {
        ...args.metadata,
        accruedOutstanding: addedToOutstanding,
      },
    });

    try {
      await sql`
        UPDATE riders
        SET
          subscription_dues_outstanding = COALESCE(subscription_dues_outstanding, 0) + ${addedToOutstanding},
          updated_at = NOW()
        WHERE id = ${args.riderId}
      `;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "42703") throw err;
    }
  }

  if (debited > 0 || addedToOutstanding > 0 || balanceAfter < 0) {
    await bumpSubscriptionPenaltyStreak(args.riderId);
  }

  await refreshRiderSubscriptionDispatchBlock(args.riderId);
  return { debited, addedToOutstanding, balanceAfter };
}

export async function touchRiderIncomeTimestamp(riderId: number): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE riders
      SET last_rider_income_at = NOW(), updated_at = NOW()
      WHERE id = ${riderId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
  }
  await refreshRiderSubscriptionDispatchBlock(riderId);
}

function incomeStale(lastIncomeAt: Date | null, now = new Date()): boolean {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - SUBSCRIPTION_INCOME_FREEZE_DAYS);
  if (!lastIncomeAt) return true;
  return lastIncomeAt.getTime() < cutoff.getTime();
}

export async function refreshRiderSubscriptionDispatchBlock(riderId: number): Promise<void> {
  const sql = getSql();
  const [balance, meta] = await Promise.all([
    readRiderWalletBalance(riderId),
    readRiderDuesMeta(riderId),
  ]);

  const walletRow = await readRiderWalletRowForSplit(riderId);
  const split = splitWalletNegativeBalance(balance, walletRow, {
    subscriptionDuesOutstanding: meta.duesOutstanding,
  });
  const totalDue = computeTotalSubscriptionDue(split.subscriptionNegative, meta.duesOutstanding);
  const hasSubscriptionDue = totalDue > 0 || split.subscriptionNegative > 0 || meta.duesOutstanding > 0;

  const shouldBlock =
    hasSubscriptionDue &&
    meta.penaltyStreakDays >= SUBSCRIPTION_INCOME_FREEZE_DAYS &&
    balance <= 0;

  try {
    if (shouldBlock && !meta.dispatchBlocked) {
      await sql`
        UPDATE riders
        SET
          subscription_dispatch_blocked = TRUE,
          subscription_dispatch_blocked_at = NOW(),
          updated_at = NOW()
        WHERE id = ${riderId}
      `;
      await forceRiderOffDutyForSubscriptionPenalty(riderId);
      return;
    }

    if (!shouldBlock && (meta.dispatchBlocked || totalDue <= 0)) {
      if (totalDue <= 0) {
        await resetSubscriptionPenaltyStreak(riderId);
      }
      await sql`
        UPDATE riders
        SET
          subscription_dispatch_blocked = FALSE,
          subscription_dispatch_blocked_at = NULL,
          subscription_dues_outstanding = CASE WHEN ${totalDue} <= 0 THEN 0 ELSE subscription_dues_outstanding END,
          updated_at = NOW()
        WHERE id = ${riderId}
      `;
      return;
    }

    if (shouldBlock && meta.dispatchBlocked) {
      await forceRiderOffDutyForSubscriptionPenalty(riderId);
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
  }
}

export async function payRiderSubscriptionDues(riderId: number): Promise<{
  ok: boolean;
  paidAmount: number;
  totalDueBefore: number;
  totalDueAfter: number;
  needEarnings?: boolean;
  error?: string;
}> {
  const snapshot = await getRiderSubscriptionDuesSnapshot(riderId);
  const totalDueBefore = snapshot.totalDue;
  if (totalDueBefore <= 0) {
    await refreshRiderSubscriptionDispatchBlock(riderId);
    return { ok: true, paidAmount: 0, totalDueBefore: 0, totalDueAfter: 0 };
  }

  const balance = snapshot.walletBalance;
  if (balance <= 0) {
    return {
      ok: false,
      paidAmount: 0,
      totalDueBefore,
      totalDueAfter: totalDueBefore,
      needEarnings: true,
      error: "insufficient_wallet_balance",
    };
  }

  const sql = getSql();
  const payAmount = round2(Math.min(balance, totalDueBefore));
  const balanceAfter = round2(balance - payAmount);

  await insertWalletEntry({
    riderId,
    entryType: "subscription_fee",
    amount: payAmount,
    balanceAfter,
    ref: `subscription_dues_pay:${Date.now()}`,
    description: "Subscription dues payment",
    metadata: { totalDueBefore, settlement: true },
  });
  await ensureWalletBalanceAfterDebit(riderId, balanceAfter);

  const meta = await readRiderDuesMeta(riderId);
  if (meta.duesOutstanding > 0) {
    const clearOutstanding = round2(Math.min(payAmount, meta.duesOutstanding));
    if (clearOutstanding > 0) {
      try {
        await sql`
          UPDATE riders
          SET
            subscription_dues_outstanding = GREATEST(0, COALESCE(subscription_dues_outstanding, 0) - ${clearOutstanding}),
            updated_at = NOW()
          WHERE id = ${riderId}
        `;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code !== "42703") throw err;
      }
    }
  }

  await refreshRiderSubscriptionDispatchBlock(riderId);
  const after = await getRiderSubscriptionDuesSnapshot(riderId);
  return {
    ok: true,
    paidAmount: payAmount,
    totalDueBefore,
    totalDueAfter: after.totalDue,
  };
}

/** After delivery earnings credit, auto-settle subscription dues from positive wallet balance. */
export async function autoSettleSubscriptionDuesFromEarnings(riderId: number): Promise<void> {
  const snapshot = await getRiderSubscriptionDuesSnapshot(riderId);
  if (snapshot.totalDue <= 0) return;
  if (snapshot.walletBalance <= 0) return;
  await payRiderSubscriptionDues(riderId);
}

export async function evaluateAllRiderSubscriptionRestrictions(): Promise<{
  evaluated: number;
  blocked: number;
}> {
  const sql = getSql();
  let rows: { id: number }[];
  try {
    rows = await sql`
      SELECT id
      FROM riders
      WHERE COALESCE(subscription_dues_outstanding, 0) > 0
         OR COALESCE(subscription_dispatch_blocked, FALSE) = TRUE
         OR EXISTS (
           SELECT 1 FROM rider_subscriptions rs
           WHERE rs.rider_id = riders.id
             AND rs.status = 'active'
             AND rs.auto_wallet_deduction = TRUE
             AND rs.end_date > NOW()
         )
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    rows = await sql`
      SELECT DISTINCT rs.rider_id AS id
      FROM rider_subscriptions rs
      WHERE rs.status = 'active'
        AND rs.auto_wallet_deduction = TRUE
        AND rs.end_date > NOW()
    `;
  }

  let blocked = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const riderId = Number(row.id);
    await refreshRiderSubscriptionDispatchBlock(riderId);
    if (await isRiderSubscriptionDispatchBlocked(riderId)) blocked += 1;
  }
  return { evaluated: Array.isArray(rows) ? rows.length : 0, blocked };
}

export function formatSubscriptionWalletError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid input value for enum.*subscription_fee/i.test(msg)) {
    return "Subscription wallet is not configured. Run database migrations 0316 and 0317.";
  }
  if (/wallet_ledger_balance_non_negative|wallet_ledger_amount_non_negative/i.test(msg)) {
    return "Wallet ledger constraints need update. Run database migration 0317.";
  }
  return msg;
}
