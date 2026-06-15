import { getSql } from "../db/client.js";

export type RiderLedgerSegment =
  | "all"
  | "food"
  | "parcel"
  | "ride"
  | "incentives"
  | "adjustments"
  | "penalties"
  | "withdrawals"
  | "subscriptions";

const ADJUSTMENT_ENTRY_TYPES = new Set(["adjustment", "refund", "onboarding_fee"]);

export type RiderLedgerPeriod = "this_month" | "last_month" | "all";

const CREDIT_ENTRY_TYPES = new Set([
  "earning",
  "bonus",
  "refund",
  "referral_bonus",
  "penalty_reversal",
]);

const INCENTIVE_ENTRY_TYPES = new Set(["bonus", "referral_bonus"]);

const SUMMARY_WITHDRAWAL_ONLY_TYPES = new Set(["withdrawal"]);

/** Debits that reduce wallet balance but are not bank withdrawals — net off earnings. */
const EARNINGS_DEDUCTION_TYPES = new Set([
  "subscription_fee",
  "penalty",
  "onboarding_fee",
]);

type LedgerRow = {
  id: number;
  entry_type: string;
  amount: string | number;
  balance: string | number | null;
  ref: string | null;
  ref_type: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  service_type?: string | null;
};

export type RiderLedgerEntryDto = {
  id: number;
  entryType: string;
  flow: "credit" | "debit";
  category: string;
  description: string;
  amount: number;
  balance: number | null;
  ref: string | null;
  refType: string | null;
  serviceType: string | null;
  createdAt: string;
};

export type RiderLedgerSummaryDto = {
  totalEarnings: number;
  totalWithdrawals: number;
  pendingSettlement: number;
  monthLabel: string;
};

export function isCreditEntryType(entryType: string): boolean {
  return CREDIT_ENTRY_TYPES.has(entryType.toLowerCase());
}

function resolveServiceType(row: LedgerRow): string | null {
  const direct = row.service_type?.trim();
  if (direct) return direct.toLowerCase();
  const meta = row.metadata ?? {};
  for (const key of ["serviceType", "service_type", "service"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return null;
}

function categoryForRow(row: LedgerRow): string {
  const entryType = row.entry_type.toLowerCase();
  if (entryType === "subscription_fee") return "subscriptions";
  if (entryType === "penalty") return "penalties";
  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";
  if (INCENTIVE_ENTRY_TYPES.has(entryType)) return "incentives";

  const service = resolveServiceType(row);
  if (service === "food") return "food";
  if (service === "parcel") return "parcel";
  if (service === "person_ride" || service === "ride") return "ride";

  if (entryType === "earning") return service ?? "food";
  return "other";
}

function descriptionForRow(row: LedgerRow): string {
  const desc = row.description?.trim();
  if (desc) return desc;

  const ref = row.ref?.trim();
  const refType = row.ref_type?.toLowerCase() ?? "";

  if (refType === "order" && ref) return `Order #${ref}`;
  if (refType === "withdrawal" && ref) return `Withdrawal #${ref}`;
  if (ref) return ref;

  switch (row.entry_type.toLowerCase()) {
    case "earning":
      return "Order earning";
    case "bonus":
      return "Bonus credited";
    case "referral_bonus":
      return "Referral bonus";
    case "penalty":
      return "Penalty deducted";
    case "refund":
      return "Refund credited";
    case "onboarding_fee":
      return "Onboarding fee";
    case "subscription_fee":
      return "Subscription fee deduction";
    case "adjustment":
      return "Wallet adjustment";
    default:
      return row.entry_type.replace(/_/g, " ");
  }
}

function resolveDateRange(period: RiderLedgerPeriod): {
  from?: Date;
  to?: Date;
  label: string;
  monthLabel: string;
} {
  if (period === "all") {
    return { label: "All time", monthLabel: "All Time Summary" };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "this_month") {
    const from = new Date(year, month, 1, 0, 0, 0, 0);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthLabel = from.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
    return { from, to, label: "This month", monthLabel: `${monthLabel} Summary` };
  }

  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const monthLabel = from.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  return { from, to, label: "Last month", monthLabel: `${monthLabel} Summary` };
}

function isWithdrawalRow(row: LedgerRow): boolean {
  const entryType = row.entry_type.toLowerCase();
  const refType = row.ref_type?.toLowerCase() ?? "";
  return (
    SUMMARY_WITHDRAWAL_ONLY_TYPES.has(entryType) ||
    refType === "withdrawal"
  );
}

function isEarningsDeductionRow(row: LedgerRow): boolean {
  return EARNINGS_DEDUCTION_TYPES.has(row.entry_type.toLowerCase());
}

function computeSummary(
  rows: LedgerRow[],
  monthLabel: string,
  pendingSettlement: number,
): RiderLedgerSummaryDto {
  let grossEarnings = 0;
  let earningsDeductions = 0;
  let totalWithdrawals = 0;

  for (const row of rows) {
    const amount = Math.abs(Number(row.amount ?? 0));
    const entryType = row.entry_type.toLowerCase();

    if (isWithdrawalRow(row)) {
      totalWithdrawals += amount;
      continue;
    }
    if (isEarningsDeductionRow(row)) {
      earningsDeductions += amount;
      continue;
    }
    if (isCreditEntryType(entryType)) {
      grossEarnings += amount;
    }
  }

  const totalEarnings = Math.round((grossEarnings - earningsDeductions) * 100) / 100;

  return {
    totalEarnings,
    totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
    pendingSettlement: Math.round(Math.max(0, pendingSettlement) * 100) / 100,
    monthLabel,
  };
}

async function fetchPendingWithdrawalTotal(
  riderId: number,
  from?: Date,
  to?: Date,
): Promise<number> {
  const sql = getSql();
  try {
    if (from && to) {
      const [row] = (await sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM withdrawal_requests
        WHERE rider_id = ${riderId}
          AND status IN ('pending', 'processing')
          AND created_at >= ${from.toISOString()}
          AND created_at <= ${to.toISOString()}
      `) as { total: string | number }[];
      return Number(row?.total ?? 0);
    }

    const [row] = (await sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM withdrawal_requests
      WHERE rider_id = ${riderId}
        AND status IN ('pending', 'processing')
    `) as { total: string | number }[];
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

function segmentMatchesRow(segment: RiderLedgerSegment, row: LedgerRow): boolean {
  if (segment === "all") return true;

  const entryType = row.entry_type.toLowerCase();
  const category = categoryForRow(row);

  if (segment === "incentives") return INCENTIVE_ENTRY_TYPES.has(entryType);
  if (segment === "penalties") return entryType === "penalty";
  if (segment === "adjustments") return ADJUSTMENT_ENTRY_TYPES.has(entryType);
  if (segment === "withdrawals") return isWithdrawalRow(row);
  if (segment === "subscriptions") return entryType === "subscription_fee";
  if (segment === "food") return category === "food";
  if (segment === "parcel") return category === "parcel";
  if (segment === "ride") return category === "ride";
  return true;
}

function mapRow(row: LedgerRow): RiderLedgerEntryDto {
  const entryType = row.entry_type.toLowerCase();
  const amount = Math.abs(Number(row.amount ?? 0));
  return {
    id: Number(row.id),
    entryType,
    flow: isCreditEntryType(entryType) ? "credit" : "debit",
    category: categoryForRow(row),
    description: descriptionForRow(row),
    amount,
    balance: row.balance != null ? Number(row.balance) : null,
    ref: row.ref,
    refType: row.ref_type,
    serviceType: resolveServiceType(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function fetchLedgerRows(
  riderId: number,
  from?: Date,
  to?: Date,
): Promise<LedgerRow[]> {
  const sql = getSql();

  try {
    if (from && to) {
      return (await sql`
        SELECT
          id,
          entry_type,
          amount,
          balance,
          ref,
          ref_type,
          description,
          metadata,
          created_at,
          service_type
        FROM wallet_ledger
        WHERE rider_id = ${riderId}
          AND created_at >= ${from.toISOString()}
          AND created_at <= ${to.toISOString()}
        ORDER BY created_at DESC
      `) as LedgerRow[];
    }

    return (await sql`
      SELECT
        id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        created_at,
        service_type
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
      ORDER BY created_at DESC
    `) as LedgerRow[];
  } catch {
    if (from && to) {
      return (await sql`
        SELECT
          id,
          entry_type,
          amount,
          balance,
          ref,
          ref_type,
          description,
          metadata,
          created_at
        FROM wallet_ledger
        WHERE rider_id = ${riderId}
          AND created_at >= ${from.toISOString()}
          AND created_at <= ${to.toISOString()}
        ORDER BY created_at DESC
      `) as LedgerRow[];
    }

    return (await sql`
      SELECT
        id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        created_at
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
      ORDER BY created_at DESC
    `) as LedgerRow[];
  }
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function sumCreditEarningsForPeriod(
  riderId: number,
  from: Date,
  to: Date,
): Promise<number> {
  const sql = getSql();
  const creditTypes = Array.from(CREDIT_ENTRY_TYPES);

  try {
    const [row] = (await sql`
      SELECT COALESCE(SUM(ABS(amount::numeric)), 0) AS total
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND created_at >= ${from.toISOString()}
        AND created_at <= ${to.toISOString()}
        AND LOWER(entry_type) = ANY(${creditTypes})
    `) as { total: string | number }[];
    return Number(row?.total ?? 0);
  } catch {
    const rows = await fetchLedgerRows(riderId, from, to);
    let total = 0;
    for (const row of rows) {
      if (isWithdrawalRow(row)) continue;
      if (isCreditEntryType(row.entry_type.toLowerCase())) {
        total += Math.abs(Number(row.amount ?? 0));
      }
    }
    return total;
  }
}

export async function getRiderPeriodEarningsTotals(
  riderId: number,
): Promise<{ thisWeek: number; thisMonth: number }> {
  const now = new Date();
  const weekFrom = startOfWeek(now);
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = endOfDay(now);

  const [thisWeek, thisMonth] = await Promise.all([
    sumCreditEarningsForPeriod(riderId, weekFrom, to),
    sumCreditEarningsForPeriod(riderId, monthFrom, to),
  ]);

  return {
    thisWeek: Math.round(thisWeek * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
  };
}

export async function getRiderSubscriptionDebitedTotal(riderId: number): Promise<number> {
  const sql = getSql();
  try {
    const [row] = (await sql`
      SELECT COALESCE(SUM(ABS(amount::numeric)), 0) AS total
      FROM wallet_ledger
      WHERE rider_id = ${riderId}
        AND LOWER(entry_type) = 'subscription_fee'
    `) as { total: string | number }[];
    return Math.round(Number(row?.total ?? 0) * 100) / 100;
  } catch {
    const rows = await fetchLedgerRows(riderId);
    let total = 0;
    for (const row of rows) {
      if (row.entry_type.toLowerCase() === "subscription_fee") {
        total += Math.abs(Number(row.amount ?? 0));
      }
    }
    return Math.round(total * 100) / 100;
  }
}

export async function getRiderLedgerForApp(args: {
  riderId: number;
  segment?: RiderLedgerSegment;
  period?: RiderLedgerPeriod;
  limit?: number;
  offset?: number;
}): Promise<{
  entries: RiderLedgerEntryDto[];
  total: number;
  hasMore: boolean;
  periodLabel: string;
  summary: RiderLedgerSummaryDto;
}> {
  const segment = args.segment ?? "all";
  const period = args.period ?? "this_month";
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const offset = Math.max(0, args.offset ?? 0);
  const { from, to, label, monthLabel } = resolveDateRange(period);

  try {
    const { ensureRiderSubscriptionRenewalDebited } = await import(
      "../modules/rider/rider-subscription.service.js"
    );
    await ensureRiderSubscriptionRenewalDebited(args.riderId);
  } catch (err) {
    console.warn("[getRiderLedgerForApp] subscription renewal check failed:", err);
  }

  const rows = await fetchLedgerRows(args.riderId, from, to);
  const pendingSettlement = await fetchPendingWithdrawalTotal(args.riderId, from, to);
  const summary = computeSummary(rows, monthLabel, pendingSettlement);
  const filtered = rows.filter((row) => segmentMatchesRow(segment, row));
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    entries: slice.map(mapRow),
    total,
    hasMore,
    periodLabel: label,
    summary,
  };
}
