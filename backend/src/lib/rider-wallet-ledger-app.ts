import { getSql } from "../db/client.js";
import { readRideRiderPayoutSnapshot } from "./ride-rider-payout-snapshot.js";
import {
  getRiderSettlementSummary,
  listRiderSettlementSummaries,
  type RiderSettlementSummary,
} from "./rider-settlement-summary.js";

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
  // Rider paid money in (Razorpay negative-wallet settlement, manual credit).
  "manual_add",
  "cancellation_payout",
]);

/**
 * Money the rider EARNED — work, incentives, company-funded payouts. Earnings
 * totals (home week/month, earnings graph) count only these. Other credits are
 * real wallet movements but not earnings: manual_add is money the rider paid in
 * (wallet recharge, penalty / dues payment) or an admin credit; penalty_reversal
 * and refund undo a deduction. Counting them inflated earnings (a rider with two
 * ₹15,273 penalty reversals showed ₹38,510 "earned").
 */
const EARNING_ENTRY_TYPES = new Set([
  "earning",
  "bonus",
  "referral_bonus",
  "incentive",
  "surge",
  "cancellation_payout",
]);

/** Undo a deduction: counted back in the NET summary, never as gross earnings. */
const DEDUCTION_REVERSAL_TYPES = new Set(["penalty_reversal", "refund"]);

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
  /**
   * Set for wallet rows written by a Ride/Parcel settlement:
   *   cash_platform_share — cash job, platform's share deducted from the wallet
   *   cash_top_up         — cash job paid less than the earning, company top-up
   *   online_earning      — customer paid online, earning credited
   */
  settlementKind: RiderSettlementKind | null;
  /**
   * The Ride/Parcel job this row belongs to — present on the wallet row a
   * settlement posted AND on the ₹0 "cash collected, no wallet change" rows, so
   * every job shows its cash / earning / wallet breakdown. Optional + additive:
   * app builds that predate it ignore the key.
   */
  job?: RiderLedgerJobDto | null;
};

export type RiderSettlementKind = "cash_platform_share" | "cash_top_up" | "online_earning";

export type RiderLedgerJobDto = {
  settlementId: string;
  serviceType: "person_ride" | "parcel";
  /** How the customer paid this job. */
  paymentMethod: "cash" | "online" | "offer";
  /** True when the rider took cash from the customer for this job. */
  cashCollected: boolean;
  /** Cash in the rider's hand from the customer (0 for online / offer). */
  cashAmount: number;
  /** C — what the customer was billed. */
  customerPayable: number;
  /** What the customer paid GatiMitra online (QR / in-app / GatiCash). */
  paidOnline: number;
  /** R — the rider's total earning for the job. */
  riderEarning: number;
  /** Signed wallet movement: + credited, − deducted, 0 none (W = R − C for cash). */
  walletChange: number;
  /**
   *   cash_platform_share — cash job, C > R: platform share deducted
   *   cash_top_up         — cash job, C < R: company top-up credited
   *   cash_no_change      — cash job, C = R: no wallet movement
   *   online_earning      — paid online: earning credited
   *   free_ride           — offer covered the fare: earning credited by the company
   */
  kind: "cash_platform_share" | "cash_top_up" | "cash_no_change" | "online_earning" | "free_ride";
  explanation: string;
};

/**
 * Earnings for Ride/Parcel jobs come from the SETTLEMENT, not the wallet: a cash
 * job's earning R is partly cash in hand (only R − C, or nothing, touches the
 * wallet), so summing wallet credits under-counted every cash job. For a settled
 * job the wallet rows that just move its money — the delivery credit, the
 * dynamic-incentive credit, the cash platform share — are replaced by its R.
 */
const JOB_MONEY_REF = /^(?:rider_earn:(?:delivery|dyn)|ride_cash_settle|parcel_cash_settle):(\d+)$/;

function jobMoneyOrderId(ref: string | null | undefined): number | null {
  const m = String(ref ?? "").trim().match(JOB_MONEY_REF);
  return m ? Number(m[1]) : null;
}

/** Which of these orders have a Ride/Parcel settlement for this rider (any date). */
async function settledOrderIdsAmong(riderId: number, orderIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return new Set();
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT order_core_id FROM ride_settlements
      WHERE rider_id = ${riderId} AND order_core_id = ANY(${ids}::bigint[])
    `) as { order_core_id: string | number }[];
    return new Set(rows.map((r) => Number(r.order_core_id)));
  } catch {
    return new Set();
  }
}

/** Synthetic history rows (jobs with no wallet row) carry the negated order id. */
export const SETTLEMENT_ACTIVITY_ENTRY_TYPE = "cash_collection";

function jobFromSettlement(s: RiderSettlementSummary): RiderLedgerJobDto {
  const walletChange = Math.round((s.walletCredit - s.walletDebit) * 100) / 100;
  const paymentMethod: RiderLedgerJobDto["paymentMethod"] =
    s.paidBy === "offer" ? "offer" : s.paymentMethod;
  const kind: RiderLedgerJobDto["kind"] =
    paymentMethod === "offer"
      ? "free_ride"
      : paymentMethod === "online"
        ? "online_earning"
        : walletChange < 0
          ? "cash_platform_share"
          : walletChange > 0
            ? "cash_top_up"
            : "cash_no_change";
  return {
    settlementId: s.settlementId,
    serviceType: s.serviceType,
    paymentMethod,
    cashCollected: paymentMethod === "cash",
    cashAmount: paymentMethod === "cash" ? s.cashCollected : 0,
    customerPayable: s.customerPayable,
    paidOnline: paymentMethod === "online" ? s.platformCollected : 0,
    riderEarning: s.riderEntitlement,
    walletChange,
    kind,
    explanation: s.explanation,
  };
}

function settlementActivityRow(s: RiderSettlementSummary): LedgerRow {
  const service = s.serviceType;
  const label = service === "parcel" ? "Cash parcel" : "Cash ride";
  const inr = (n: number) => `₹${n.toFixed(2)}`;
  const description =
    s.paidBy === "offer"
      ? `${service === "parcel" ? "Free parcel" : "Free ride"} — offer, no payment collected`
      : s.paymentMethod === "cash"
        ? `${label} — collected ${inr(s.cashCollected)} in cash · no wallet change`
        : `${service === "parcel" ? "Parcel" : "Ride"} — paid online ${inr(s.platformCollected)}`;
  return {
    id: -s.orderCoreId,
    entry_type: SETTLEMENT_ACTIVITY_ENTRY_TYPE,
    amount: 0,
    balance: s.walletBalanceAfter,
    ref: s.settlementId,
    ref_type: service === "parcel" ? "parcel_settlement" : "ride_settlement",
    description,
    metadata: { orderCoreId: s.orderCoreId, orderIdText: s.orderId, syntheticSettlementActivity: true },
    created_at: s.settledAt,
    service_type: service,
  };
}

function isSettlementActivityRow(row: LedgerRow): boolean {
  return row.entry_type === SETTLEMENT_ACTIVITY_ENTRY_TYPE && Number(row.id) < 0;
}

/** Wallet refs a Ride/Parcel settlement (or the legacy delivery credit) posts under. */
function jobWalletRefs(orderCoreId: number): string[] {
  return [
    `rider_earn:delivery:${orderCoreId}`,
    `ride_cash_settle:${orderCoreId}`,
    `parcel_cash_settle:${orderCoreId}`,
  ];
}

/**
 * Jobs (settlements) of this rider in the period, keyed by order, plus the
 * synthetic history rows for jobs that never touched the wallet.
 */
async function loadSettlementJobs(
  riderId: number,
  from?: Date,
  to?: Date
): Promise<{ jobs: Map<number, RiderLedgerJobDto>; activityRows: LedgerRow[] }> {
  const jobs = new Map<number, RiderLedgerJobDto>();
  const activityRows: LedgerRow[] = [];
  const summaries = await listRiderSettlementSummaries(riderId, { from, to }).catch(() => []);
  if (summaries.length === 0) return { jobs, activityRows };
  for (const s of summaries) jobs.set(s.orderCoreId, jobFromSettlement(s));

  // Which of these jobs moved the wallet (any time — a month boundary must not
  // turn a real wallet row into a duplicate synthetic one).
  const refs = summaries.flatMap((s) => jobWalletRefs(s.orderCoreId));
  const sql = getSql();
  const moved = new Set<number>();
  try {
    const rows = (await sql`
      SELECT ref FROM wallet_ledger
      WHERE rider_id = ${riderId} AND ref = ANY(${refs}::text[])
    `) as { ref: string }[];
    for (const r of rows) {
      const m = String(r.ref).match(/:(\d+)$/);
      if (m) moved.add(Number(m[1]));
    }
  } catch {
    return { jobs, activityRows };
  }
  for (const s of summaries) {
    if (!moved.has(s.orderCoreId)) activityRows.push(settlementActivityRow(s));
  }
  return { jobs, activityRows };
}

const SETTLEMENT_REF_TYPES = new Set(["ride_settlement", "parcel_settlement"]);

function settlementKindForRow(row: LedgerRow): RiderSettlementKind | null {
  const refType = row.ref_type?.toLowerCase() ?? "";
  const ref = row.ref?.trim() ?? "";
  // ride_cash_settle rows written before 0649 carry ref_type ride_settlement too.
  if (!SETTLEMENT_REF_TYPES.has(refType) && !/^(ride|parcel)_cash_settle:\d+$/.test(ref)) return null;
  const entryType = row.entry_type.toLowerCase();
  // 'cod_order' (positive) is the debit since the CHECK-constraint fix; rows from
  // before 0649 were written as 'adjustment'.
  if (entryType === "cod_order" || entryType === "adjustment") return "cash_platform_share";
  if (entryType !== "earning") return null;
  const meta = row.metadata ?? {};
  const method = String(meta.paymentMethod ?? "").toLowerCase();
  const source = String(meta.source ?? "").toLowerCase();
  if (method === "cash" || source.endsWith("cash_settlement")) return "cash_top_up";
  return "online_earning";
}

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
  // A cash job's platform-share debit is part of that ride/parcel, not a manual adjustment.
  if (settlementKindForRow(row) === "cash_platform_share") {
    const service = resolveServiceType(row, orderTypeByCoreId);
    if (service === "parcel") return "parcel";
    if (service === "person_ride" || service === "ride") return "ride";
  }
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
  jobEarnings?: { settledOrderIds: Set<number>; earningsInPeriod: number },
): RiderLedgerSummaryDto {
  // Ride/Parcel jobs count their earning R once (from the settlement).
  let grossEarnings = jobEarnings?.earningsInPeriod ?? 0;
  let earningsDeductions = 0;
  let totalWithdrawals = 0;

  for (const row of rows) {
    const amount = Math.abs(Number(row.amount ?? 0));
    const entryType = row.entry_type.toLowerCase();

    if (entryType === "failed_withdrawal_revert") {
      continue;
    }
    const jobId = jobMoneyOrderId(row.ref);
    if (jobId != null && jobEarnings?.settledOrderIds.has(jobId)) {
      continue; // the job's money movement — its earning is counted via R
    }
    if (isWithdrawalRow(row)) {
      totalWithdrawals += amount;
      continue;
    }
    if (isEarningsDeductionRow(row)) {
      earningsDeductions += amount;
      continue;
    }
    if (EARNING_ENTRY_TYPES.has(entryType) || DEDUCTION_REVERSAL_TYPES.has(entryType)) {
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

function serviceBucket(
  service: string | null | undefined,
): "food" | "parcel" | "ride" | null {
  const s = String(service ?? "").trim().toLowerCase();
  if (s === "food") return "food";
  if (s === "parcel") return "parcel";
  if (s === "ride" || s === "person_ride") return "ride";
  return null;
}

function segmentMatchesRow(
  segment: RiderLedgerSegment,
  row: LedgerRow,
  orderTypeByCoreId?: Map<number, string | null>,
): boolean {
  if (segment === "all") return true;

  const entryType = row.entry_type.toLowerCase();

  if (segment === "incentives") return INCENTIVE_ENTRY_TYPES.has(entryType);
  if (segment === "penalties") {
    return entryType === "penalty" || entryType === "penalty_reversal";
  }
  if (segment === "adjustments") return ADJUSTMENT_ENTRY_TYPES.has(entryType);
  if (segment === "withdrawals") return isWithdrawalRow(row);
  if (segment === "subscriptions") return entryType === "subscription_fee";
  if (segment === "food" || segment === "parcel" || segment === "ride") {
    return serviceBucket(resolveServiceType(row, orderTypeByCoreId)) === segment;
  }
  return true;
}

async function orderTypeMapForRows(rows: LedgerRow[]): Promise<Map<number, string | null>> {
  const ids = rows
    .map((row) => extractOrderCoreIdFromRow(row))
    .filter((id): id is number => id != null);
  const details = await resolveOrderCoreDetails(ids);
  const map = new Map<number, string | null>();
  for (const [id, detail] of details) map.set(id, detail.orderType);
  return map;
}

function extractOrderCoreIdFromRow(row: LedgerRow): number | null {
  const meta = row.metadata ?? {};
  for (const key of ["orderId", "ordersCoreId", "order_core_id"]) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }

  const settlementOrder = meta.orderCoreId;
  if (typeof settlementOrder === "number" && Number.isFinite(settlementOrder) && settlementOrder > 0) {
    return settlementOrder;
  }

  const ref = row.ref?.trim() ?? "";
  const penaltyMatch = ref.match(/^rider_cancel_pen:(\d+):/);
  if (penaltyMatch) return Number(penaltyMatch[1]);

  const settleMatch = ref.match(/^(?:ride|parcel)_cash_settle:(\d+)$/);
  if (settleMatch) return Number(settleMatch[1]);

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
  orderDetails: Map<number, { publicId: string; orderType: string | null }>,
  jobs?: Map<number, RiderLedgerJobDto>
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

  const synthetic = isSettlementActivityRow(row);
  const ref = row.ref?.trim() ?? "";
  const isJobWalletRow =
    synthetic ||
    /^rider_earn:delivery:\d+$/.test(ref) ||
    /^(ride|parcel)_cash_settle:\d+$/.test(ref);
  const job = coreId != null && isJobWalletRow ? jobs?.get(coreId) ?? null : null;
  return {
    id: Number(row.id),
    entryType,
    // A ₹0 job row is neither money in nor out; "credit" keeps older app builds
    // from painting it as a deduction.
    flow: synthetic || isCreditFlowType(entryType) ? "credit" : "debit",
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
    settlementKind: settlementKindForRow(row),
    job,
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
  const creditTypes = Array.from(EARNING_ENTRY_TYPES);

  try {
    // Wallet credits that are not a settled Ride/Parcel job's money movement,
    // plus the earning R of every job settled in the period (cash jobs included).
    const [row] = (await sql`
      SELECT
        (SELECT COALESCE(SUM(ABS(w.amount::numeric)), 0)
           FROM wallet_ledger w
          WHERE w.rider_id = ${riderId}
            AND w.created_at >= ${from.toISOString()}
            AND w.created_at <= ${to.toISOString()}
            AND LOWER(w.entry_type::text) = ANY(${creditTypes})
            AND NOT (
              COALESCE(w.ref, '') ~ '^rider_earn:(delivery|dyn):[0-9]+$'
              AND EXISTS (
                SELECT 1 FROM ride_settlements s
                WHERE s.rider_id = ${riderId}
                  AND s.order_core_id = split_part(w.ref, ':', 3)::bigint
              )
            )) +
        (SELECT COALESCE(SUM(s.rider_earnings::numeric), 0)
           FROM ride_settlements s
          WHERE s.rider_id = ${riderId}
            AND s.posted_at >= ${from.toISOString()}
            AND s.posted_at <= ${to.toISOString()}) AS total
    `) as { total: string | number }[];
    return Number(row?.total ?? 0);
  } catch {
    const rows = await fetchLedgerRows(riderId, from, to);
    let total = 0;
    for (const row of rows) {
      if (isWithdrawalRow(row)) continue;
      if (EARNING_ENTRY_TYPES.has(row.entry_type.toLowerCase())) {
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

  const fetched = await fetchLedgerRows(args.riderId, from, to);
  const graphOrderTypes = await orderTypeMapForRows(fetched);
  const settledForGraph = await settledOrderIdsAmong(
    args.riderId,
    fetched.map((r) => jobMoneyOrderId(r.ref)).filter((id): id is number => id != null)
  );
  // A settled Ride/Parcel job is graphed once from its settlement (R), below.
  const rows = fetched.filter(
    (row) =>
      segmentMatchesRow(segment, row, graphOrderTypes) &&
      !settledForGraph.has(jobMoneyOrderId(row.ref) ?? -1)
  );
  const graphJobs = (await listRiderSettlementSummaries(args.riderId, { from, to }).catch(() => [])).filter(
    (j) =>
      segment === "all" ||
      (segment === "ride" && j.serviceType === "person_ride") ||
      (segment === "parcel" && j.serviceType === "parcel")
  );

  const coreIds = [
    ...new Set([
      ...rows.map((row) => parseEarningRef(row.ref)?.coreId).filter((id): id is number => id != null),
      ...graphJobs.map((j) => j.orderCoreId),
    ]),
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
    if (!EARNING_ENTRY_TYPES.has(entryType)) continue;

    const amount = round2(Math.abs(Number(row.amount ?? 0)));
    if (amount <= 0) continue;

    totalEarning = round2(totalEarning + amount);

    const dayKey = dayKeyIst(new Date(row.created_at));
    creditByDay.set(dayKey, round2((creditByDay.get(dayKey) ?? 0) + amount));

    if (INCENTIVE_ENTRY_TYPES.has(entryType) || entryType === "incentive") {
      incentive = round2(incentive + amount);
      continue;
    }
    if (entryType === "surge") {
      surge = round2(surge + amount);
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

  for (const job of graphJobs) {
    const amount = round2(Math.max(0, job.riderEntitlement));
    if (amount <= 0) continue;
    totalEarning = round2(totalEarning + amount);
    const dayKey = dayKeyIst(new Date(job.settledAt));
    creditByDay.set(dayKey, round2((creditByDay.get(dayKey) ?? 0) + amount));
    orderIds.add(job.orderCoreId);
    const dayOrders = ordersByDay.get(dayKey) ?? new Set<number>();
    dayOrders.add(job.orderCoreId);
    ordersByDay.set(dayKey, dayOrders);
    const split = splitDeliveryLedgerAmount(amount, billingByCoreId.get(job.orderCoreId), null);
    orderEarning = round2(orderEarning + split.orderEarning);
    surge = round2(surge + split.surge);
    waiting = round2(waiting + split.waiting);
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

  const ledgerRows = await fetchLedgerRows(args.riderId, from, to);
  const pendingSettlement = await fetchPendingWithdrawalTotal(args.riderId, from, to);
  // Every Ride/Parcel job is in the history — a cash job where C = R moved the
  // wallet by ₹0 and has no wallet row, so it is added as a ₹0 activity row.
  const { jobs, activityRows } = await loadSettlementJobs(args.riderId, from, to);
  // Summary stays account-level for the period. Service chips filter the list only.
  const settledOrderIds = await settledOrderIdsAmong(
    args.riderId,
    ledgerRows.map((r) => jobMoneyOrderId(r.ref)).filter((id): id is number => id != null)
  );
  const earningsInPeriod = [...jobs.values()].reduce((sum, j) => sum + j.riderEarning, 0);
  const summary = computeSummary(ledgerRows, monthLabel, pendingSettlement, {
    settledOrderIds,
    earningsInPeriod: Math.round(earningsInPeriod * 100) / 100,
  });
  const rows = [...ledgerRows, ...activityRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const orderTypeByCoreId = await orderTypeMapForRows(rows);
  const filtered = rows.filter((row) => segmentMatchesRow(segment, row, orderTypeByCoreId));
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  const orderCoreIds = slice
    .map((row) => extractOrderCoreIdFromRow(row))
    .filter((id): id is number => id != null);
  const orderDetails = await resolveOrderCoreDetails(orderCoreIds);

  return {
    entries: slice.map((row) => mapRow(row, orderDetails, jobs)),
    total,
    hasMore,
    periodLabel: label,
    summary,
  };
}

export type RiderLedgerEntryDetailDto = RiderLedgerEntryDto & {
  purpose: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  paymentRecordId: number | null;
  currency: string;
  processedAt: string | null;
  refundStatus: string | null;
  refundId: string | null;
  /** Backend settlement transparency from earning metadata (never invent in app). */
  settlementDifferenceReason: string | null;
  settlementDifferenceAmount: number | null;
  settlementDispatchOfferAmount: number | null;
  settlementFinalAmount: number | null;
  /** Full Ride/Parcel settlement this wallet row belongs to (cash vs earning vs wallet). */
  settlement: RiderSettlementSummary | null;
};

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export async function getRiderLedgerEntryDetail(
  riderId: number,
  entryId: number,
): Promise<RiderLedgerEntryDetailDto | null> {
  const sql = getSql();
  if (entryId < 0) return getSettlementActivityDetail(riderId, -entryId);
  let rows: LedgerRow[];
  try {
    rows = (await sql`
      SELECT id, entry_type, amount, balance, ref, ref_type, description, metadata, created_at,
             service_type
      FROM wallet_ledger
      WHERE rider_id = ${riderId} AND id = ${entryId}
      LIMIT 1
    `) as LedgerRow[];
  } catch {
    rows = (await sql`
      SELECT id, entry_type, amount, balance, ref, ref_type, description, metadata, created_at
      FROM wallet_ledger
      WHERE rider_id = ${riderId} AND id = ${entryId}
      LIMIT 1
    `) as LedgerRow[];
  }
  const row = rows[0];
  if (!row) return null;

  const details = await resolveOrderCoreDetails(
    [extractOrderCoreIdFromRow(row)].filter((id): id is number => id != null),
  );
  const mapped = mapRow(row, details);
  const linkedSettlement = await readLinkedSettlement(riderId, row, mapped);
  const meta = row.metadata ?? {};
  const razorpayPaymentId =
    metaString(meta, "razorpayPaymentId") ||
    (row.ref_type === "negative_wallet_recovery" ? row.ref?.trim() || null : null);
  const razorpayOrderId = metaString(meta, "razorpayOrderId");

  type RiderWalletPaymentRow = {
    id: number;
    purpose: string | null;
    status: string | null;
    method: string | null;
    razorpay_payment_id: string | null;
    razorpay_order_id: string | null;
    updated_at: Date | string | null;
    refund_status: string | null;
    refund_id: string | null;
  };
  let payment: RiderWalletPaymentRow | null = null;

  if (razorpayPaymentId) {
    const payRows = (await sql`
      SELECT id, purpose, status, method, razorpay_payment_id, razorpay_order_id,
             updated_at, refund_status, refund_id
      FROM rider_wallet_payments
      WHERE rider_id = ${riderId} AND razorpay_payment_id = ${razorpayPaymentId}
      LIMIT 1
    `) as RiderWalletPaymentRow[];
    payment = payRows[0] ?? null;
  } else if (razorpayOrderId) {
    const payRows = (await sql`
      SELECT id, purpose, status, method, razorpay_payment_id, razorpay_order_id,
             updated_at, refund_status, refund_id
      FROM rider_wallet_payments
      WHERE rider_id = ${riderId} AND razorpay_order_id = ${razorpayOrderId}
      ORDER BY created_at DESC
      LIMIT 1
    `) as RiderWalletPaymentRow[];
    payment = payRows[0] ?? null;
  }

  const purpose =
    payment?.purpose?.trim() ||
    (row.ref_type === "negative_wallet_recovery" ? "negative_wallet_recovery" : null) ||
    (mapped.entryType === "penalty" ? "penalty" : null);

  const settlementRaw =
    meta.settlement != null && typeof meta.settlement === "object"
      ? (meta.settlement as Record<string, unknown>)
      : null;
  const settlementDifferenceReason =
    (settlementRaw && typeof settlementRaw.difference_reason_text === "string"
      ? settlementRaw.difference_reason_text.trim()
      : null) || null;
  const numOrNull = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };

  return {
    ...mapped,
    purpose,
    paymentStatus: payment?.status?.trim() || null,
    paymentMethod: payment?.method?.trim() || (razorpayPaymentId ? "razorpay" : null),
    razorpayPaymentId: payment?.razorpay_payment_id?.trim() || razorpayPaymentId,
    razorpayOrderId: payment?.razorpay_order_id?.trim() || razorpayOrderId,
    paymentRecordId: payment?.id ?? null,
    currency: "INR",
    processedAt: payment?.updated_at ? new Date(payment.updated_at).toISOString() : null,
    refundStatus: payment?.refund_status?.trim() || null,
    refundId: payment?.refund_id?.trim() || null,
    settlementDifferenceReason,
    settlementDifferenceAmount: settlementRaw
      ? numOrNull(settlementRaw.difference_amount)
      : null,
    settlementDispatchOfferAmount: settlementRaw
      ? numOrNull(settlementRaw.dispatch_offer_amount)
      : null,
    settlementFinalAmount: settlementRaw
      ? numOrNull(settlementRaw.final_settlement_amount)
      : null,
    settlement: linkedSettlement,
    job: linkedSettlement ? jobFromSettlement(linkedSettlement) : mapped.job ?? null,
  };
}

/** Detail for a ₹0 job row (negative id = −order id): built from the settlement. */
async function getSettlementActivityDetail(
  riderId: number,
  orderCoreId: number
): Promise<RiderLedgerEntryDetailDto | null> {
  const [s] = await listRiderSettlementSummaries(riderId, { orderCoreIds: [orderCoreId] });
  if (!s) return null;
  const row = settlementActivityRow(s);
  const details = await resolveOrderCoreDetails([orderCoreId]);
  const mapped = mapRow(row, details, new Map([[orderCoreId, jobFromSettlement(s)]]));
  return {
    ...mapped,
    purpose: null,
    paymentStatus: null,
    paymentMethod: s.paidBy === "offer" ? "offer" : s.paymentMethod,
    razorpayPaymentId: null,
    razorpayOrderId: null,
    paymentRecordId: null,
    currency: "INR",
    processedAt: s.settledAt,
    refundStatus: null,
    refundId: null,
    settlementDifferenceReason: null,
    settlementDifferenceAmount: null,
    settlementDispatchOfferAmount: null,
    settlementFinalAmount: null,
    settlement: s,
  };
}

/** The Ride/Parcel settlement a wallet row was posted by (or belongs to), if any. */
async function readLinkedSettlement(
  riderId: number,
  row: LedgerRow,
  mapped: RiderLedgerEntryDto
): Promise<RiderSettlementSummary | null> {
  const isOrderEarning = /^rider_earn:delivery:\d+$/.test(row.ref?.trim() ?? "");
  if (mapped.settlementKind == null && !isOrderEarning) return null;
  const coreId = extractOrderCoreIdFromRow(row);
  if (coreId == null) return null;
  try {
    return await getRiderSettlementSummary(riderId, coreId);
  } catch {
    return null;
  }
}
