import { getSql } from "../db/client.js";
import { readRideRiderPayoutSnapshot } from "./ride-rider-payout-snapshot.js";

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

/** Credits that are not earnings (must not inflate totals / graphs). */
const CREDIT_FLOW_ONLY_TYPES = new Set(["failed_withdrawal_revert"]);

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
  orderPublicId: string | null;
  createdAt: string;
  rejectionReason: string | null;
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

function isCreditFlowType(entryType: string): boolean {
  const type = entryType.toLowerCase();
  return CREDIT_ENTRY_TYPES.has(type) || CREDIT_FLOW_ONLY_TYPES.has(type);
}

function extractRejectionReason(row: LedgerRow): string | null {
  const meta = row.metadata ?? {};
  for (const key of ["rejection_reason", "rejectionReason", "reason"]) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  const desc = row.description?.trim() ?? "";
  const match = desc.match(/Reason:\s*(.+)$/i);
  const fromDesc = match?.[1]?.trim();
  return fromDesc || null;
}

function resolveServiceType(row: LedgerRow, orderTypeByCoreId?: Map<number, string | null>): string | null {
  const direct = row.service_type?.trim();
  if (direct) return direct.toLowerCase();
  const meta = row.metadata ?? {};
  for (const key of ["serviceType", "service_type", "service", "orderType", "order_type"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  const coreId = extractOrderCoreIdFromRow(row);
  if (coreId != null && orderTypeByCoreId) {
    const orderType = orderTypeByCoreId.get(coreId);
    if (orderType?.trim()) {
      const t = orderType.trim().toLowerCase();
      if (t === "ride") return "person_ride";
      return t;
    }
  }
  return null;
}

function categoryForRow(row: LedgerRow, orderTypeByCoreId?: Map<number, string | null>): string {
  const entryType = row.entry_type.toLowerCase();
  if (entryType === "subscription_fee") return "subscriptions";
  if (entryType === "penalty" || entryType === "penalty_reversal") return "penalties";
  if (
    entryType === "withdrawal" ||
    entryType === "failed_withdrawal_revert" ||
    row.ref_type?.toLowerCase() === "withdrawal"
  ) {
    return "withdrawals";
  }
  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";
  if (INCENTIVE_ENTRY_TYPES.has(entryType)) return "incentives";

  const service = resolveServiceType(row, orderTypeByCoreId);
  if (service === "food") return "food";
  if (service === "parcel") return "parcel";
  if (service === "person_ride" || service === "ride") return "ride";

  if (entryType === "earning") return service ?? "food";
  return "other";
}

function descriptionForRow(row: LedgerRow): string {
  const entryType = row.entry_type.toLowerCase();
  const reason = extractRejectionReason(row);
  if (entryType === "failed_withdrawal_revert") {
    const base = row.description?.trim() || "Withdrawal rejected — amount reverted";
    if (reason && !/Reason:\s*/i.test(base)) {
      return `${base.replace(/\.$/, "")}. Reason: ${reason}`;
    }
    return base;
  }

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
    case "penalty_reversal":
      return "Penalty Credited Back";
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

    if (entryType === "failed_withdrawal_revert") {
      continue;
    }
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
  if (segment === "penalties") {
    return entryType === "penalty" || entryType === "penalty_reversal";
  }
  if (segment === "adjustments") return ADJUSTMENT_ENTRY_TYPES.has(entryType);
  if (segment === "withdrawals") return isWithdrawalRow(row);
  if (segment === "subscriptions") return entryType === "subscription_fee";
  if (segment === "food") return category === "food";
  if (segment === "parcel") return category === "parcel";
  if (segment === "ride") return category === "ride";
  return true;
}

function extractOrderCoreIdFromRow(row: LedgerRow): number | null {
  const meta = row.metadata ?? {};
  for (const key of ["orderId", "ordersCoreId", "order_core_id"]) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }

  const ref = row.ref?.trim() ?? "";
  const penaltyMatch = ref.match(/^rider_cancel_pen:(\d+):/);
  if (penaltyMatch) return Number(penaltyMatch[1]);

  const earningMatch = ref.match(/^rider_earn:(?:delivery|tip):(\d+)$/);
  if (earningMatch) return Number(earningMatch[1]);

  return null;
}

async function resolveOrderCoreDetails(
  coreIds: number[],
): Promise<Map<number, { publicId: string; orderType: string | null }>> {
  const unique = [...new Set(coreIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, { publicId: string; orderType: string | null }>();
  if (unique.length === 0) return out;

  const sql = getSql();
  const rows = (await sql`
    SELECT id, formatted_order_id, order_id, order_type
    FROM orders_core
    WHERE id = ANY(${unique}::int[])
  `) as {
    id: number;
    formatted_order_id: string | null;
    order_id: string | null;
    order_type: string | null;
  }[];

  for (const row of rows) {
    const formatted = row.formatted_order_id?.trim() || null;
    const business = row.order_id?.trim() || null;
    const publicId =
      (formatted && isDisplayableOrderPublicId(formatted) ? formatted : null) ||
      (business && isDisplayableOrderPublicId(business) ? business : null);
    out.set(Number(row.id), {
      publicId: publicId ?? "",
      orderType: row.order_type?.trim() || null,
    });
  }
  return out;
}

function mapRow(
  row: LedgerRow,
  orderDetails: Map<number, { publicId: string; orderType: string | null }>
): RiderLedgerEntryDto {
  const entryType = row.entry_type.toLowerCase();
  const amount = Math.abs(Number(row.amount ?? 0));
  const meta = row.metadata ?? {};
  const coreId = extractOrderCoreIdFromRow(row);
  const coreDetails = coreId != null ? orderDetails.get(coreId) : undefined;
  const orderTypeByCoreId = new Map<number, string | null>();
  if (coreId != null && coreDetails?.orderType) {
    orderTypeByCoreId.set(coreId, coreDetails.orderType);
  }
  const fromCore =
    coreDetails?.publicId && isDisplayableOrderPublicId(coreDetails.publicId)
      ? coreDetails.publicId
      : null;
  const resolvedPublicId = fromCore || readMetaOrderPublicId(meta) || null;

  return {
    id: Number(row.id),
    entryType,
    flow: isCreditFlowType(entryType) ? "credit" : "debit",
    category: categoryForRow(row, orderTypeByCoreId),
    description: descriptionForRow(row),
    amount,
    balance: row.balance != null ? Number(row.balance) : null,
    ref: row.ref,
    refType: row.ref_type,
    serviceType: resolveServiceType(row, orderTypeByCoreId),
    orderPublicId: resolvedPublicId,
    createdAt: new Date(row.created_at).toISOString(),
    rejectionReason: extractRejectionReason(row),
  };
}

function isBareCorePkId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function isDisplayableOrderPublicId(value: string | null | undefined): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (v.startsWith("rider_earn:") || v.startsWith("rider_cancel_pen:")) return false;
  return !isBareCorePkId(v);
}

function readMetaOrderPublicId(meta: Record<string, unknown>): string | null {
  for (const key of ["orderPublicId", "displayId", "orderIdText"]) {
    const raw = meta[key];
    const value =
      typeof raw === "string"
        ? raw.trim()
        : typeof raw === "number" && Number.isFinite(raw)
          ? String(raw)
          : "";
    if (isDisplayableOrderPublicId(value)) return value;
  }
  return null;
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKeyIst(date: Date): string {
  return startOfDay(date).toISOString();
}

function eachDayInclusive(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur.getTime() <= end.getTime()) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatGraphRangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const left = from.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = to.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${left} - ${right}`;
}

function parseEarningRef(ref: string | null): { kind: "delivery" | "tip"; coreId: number } | null {
  const value = ref?.trim() ?? "";
  const match = value.match(/^rider_earn:(delivery|tip):(\d+)$/);
  if (!match) return null;
  const coreId = Number(match[2]);
  if (!Number.isFinite(coreId) || coreId <= 0) return null;
  return { kind: match[1] as "delivery" | "tip", coreId };
}

function splitDeliveryLedgerAmount(
  amount: number,
  billingSnapshot: unknown,
  metadata: Record<string, unknown> | null,
): { orderEarning: number; surge: number; waiting: number } {
  const ledgerAmount = round2(Math.max(0, amount));
  if (ledgerAmount <= 0) {
    return { orderEarning: 0, surge: 0, waiting: 0 };
  }

  const metaBase = round2(Number(metadata?.baseEarning ?? metadata?.base_earning ?? 0));
  const metaWait = round2(Number(metadata?.waitingEarning ?? metadata?.waiting_earning ?? 0));
  const metaSurge = round2(Number(metadata?.surgeEarning ?? metadata?.surge_earning ?? 0));
  const metaSubtotal = round2(metaBase + metaWait + metaSurge);

  let base = 0;
  let waiting = 0;
  let surge = 0;

  if (metaSubtotal > 0) {
    base = metaBase;
    waiting = metaWait;
    surge = metaSurge;
  } else {
    const snap = readRideRiderPayoutSnapshot(billingSnapshot);
    if (snap) {
      base = snap.baseEarning;
      waiting = snap.waitingEarning;
      surge = snap.surgeEarning;
    }
  }

  const subtotal = round2(base + waiting + surge);
  if (subtotal <= 0) {
    return { orderEarning: ledgerAmount, surge: 0, waiting: 0 };
  }

  const scale = ledgerAmount / subtotal;
  let orderEarning = round2(base * scale);
  let waitingPart = round2(waiting * scale);
  let surgePart = round2(surge * scale);
  const remainder = round2(ledgerAmount - (orderEarning + waitingPart + surgePart));
  orderEarning = round2(orderEarning + remainder);

  return { orderEarning, surge: surgePart, waiting: waitingPart };
}

export type RiderLedgerGraphDayBarDto = {
  date: string;
  day: number;
  amount: number;
  orderCount: number;
};

export type RiderLedgerGraphBreakdownDto = {
  totalEarning: number;
  orderEarning: number;
  incentive: number;
  surge: number;
  waiting: number;
  orderCount: number;
  rangeLabel: string;
  from: string;
  to: string;
  dailyBars: RiderLedgerGraphDayBarDto[];
};

export async function getRiderLedgerGraphForApp(args: {
  riderId: number;
  segment?: RiderLedgerSegment;
  from: Date;
  to: Date;
}): Promise<RiderLedgerGraphBreakdownDto> {
  const segment = args.segment ?? "all";
  const from = startOfDay(args.from);
  const to = endOfDay(args.to);

  const rows = (await fetchLedgerRows(args.riderId, from, to)).filter((row) =>
    segmentMatchesRow(segment, row),
  );

  const coreIds = [
    ...new Set(
      rows
        .map((row) => parseEarningRef(row.ref)?.coreId)
        .filter((id): id is number => id != null),
    ),
  ];

  const sql = getSql();
  const billingByCoreId = new Map<number, unknown>();
  if (coreIds.length > 0) {
    const billingRows = (await sql`
      SELECT id, billing_snapshot
      FROM orders_core
      WHERE id = ANY(${coreIds}::int[])
    `) as { id: number; billing_snapshot: unknown }[];
    for (const row of billingRows) {
      billingByCoreId.set(Number(row.id), row.billing_snapshot);
    }
  }

  let totalEarning = 0;
  let orderEarning = 0;
  let incentive = 0;
  let surge = 0;
  let waiting = 0;
  const orderIds = new Set<number>();
  const creditByDay = new Map<string, number>();
  const ordersByDay = new Map<string, Set<number>>();

  for (const row of rows) {
    const entryType = row.entry_type.toLowerCase();
    if (!isCreditEntryType(entryType)) continue;

    const amount = round2(Math.abs(Number(row.amount ?? 0)));
    if (amount <= 0) continue;

    totalEarning = round2(totalEarning + amount);

    const dayKey = dayKeyIst(new Date(row.created_at));
    creditByDay.set(dayKey, round2((creditByDay.get(dayKey) ?? 0) + amount));

    if (INCENTIVE_ENTRY_TYPES.has(entryType)) {
      incentive = round2(incentive + amount);
      continue;
    }

    const parsedRef = parseEarningRef(row.ref);
    if (parsedRef) {
      orderIds.add(parsedRef.coreId);
      const dayOrders = ordersByDay.get(dayKey) ?? new Set<number>();
      dayOrders.add(parsedRef.coreId);
      ordersByDay.set(dayKey, dayOrders);

      const billingSnapshot = billingByCoreId.get(parsedRef.coreId);
      const meta =
        row.metadata != null && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null;

      if (parsedRef.kind === "tip") {
        orderEarning = round2(orderEarning + amount);
        continue;
      }

      const split = splitDeliveryLedgerAmount(amount, billingSnapshot, meta);
      orderEarning = round2(orderEarning + split.orderEarning);
      surge = round2(surge + split.surge);
      waiting = round2(waiting + split.waiting);
      continue;
    }

    // Other credits (refund, penalty_reversal, etc.) count toward total + order earning bucket.
    orderEarning = round2(orderEarning + amount);
  }

  const breakdownSum = round2(orderEarning + incentive + surge + waiting);
  if (breakdownSum !== totalEarning) {
    orderEarning = round2(orderEarning + round2(totalEarning - breakdownSum));
  }

  const dailyBars = eachDayInclusive(from, to).map((day) => {
    const key = dayKeyIst(day);
    return {
      date: key,
      day: day.getDate(),
      amount: creditByDay.get(key) ?? 0,
      orderCount: ordersByDay.get(key)?.size ?? 0,
    };
  });

  return {
    totalEarning,
    orderEarning,
    incentive,
    surge,
    waiting,
    orderCount: orderIds.size,
    rangeLabel: formatGraphRangeLabel(from, to),
    from: from.toISOString(),
    to: to.toISOString(),
    dailyBars,
  };
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

  const orderCoreIds = slice
    .map((row) => extractOrderCoreIdFromRow(row))
    .filter((id): id is number => id != null);
  const orderDetails = await resolveOrderCoreDetails(orderCoreIds);

  return {
    entries: slice.map((row) => mapRow(row, orderDetails)),
    total,
    hasMore,
    periodLabel: label,
    summary,
  };
}
