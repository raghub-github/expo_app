import type { LedgerEntry } from "@/lib/wallet-types";
import { ledgerEntryTimestamp, parsePgTimestamp } from "@/lib/parse-pg-timestamp";
import { splitCancellationEligibleMessage } from "@/lib/merchantCancellationCompensation";
import {
  computeSettlementFromLedgerEntries,
  isCancellationStoreDebit,
  mapSettlementApiResponse,
  mapSettlementToClient,
  type MerchantPayoutSettlementClient,
} from "@gatimitra/merchant-payout";

export type PayoutStatus = "PAID" | "PROCESSING" | "FAILED" | "ACCRUING";

export type PayoutCard = {
  id: string;
  netPayout: number;
  orderCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  payoutDate: Date | null;
  status: PayoutStatus;
  sourceEntry?: LedgerEntry;
  /** Live accruing cycle — extends daily until merchant withdraws. */
  isCurrentCycle?: boolean;
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function startOfIstDay(d: Date): Date {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

function endOfIstDay(d: Date): Date {
  return new Date(startOfIstDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

function dayAfterIst(d: Date): Date {
  const next = startOfIstDay(d);
  next.setTime(next.getTime() + 24 * 60 * 60 * 1000);
  return next;
}

function sumEarningsInRange(earnings: LedgerEntry[], from: Date, to: Date): number {
  const fromTs = from.getTime();
  const toTs = to.getTime();
  return earnings.reduce((sum, entry) => {
    const ts = ledgerEntryTimestamp(entry)?.getTime();
    if (ts == null || ts < fromTs || ts > toTs) return sum;
    return sum + Number(entry.amount ?? 0);
  }, 0);
}

function ledgerEntryAffectsWalletBalance(entry: LedgerEntry): boolean {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const impact = String(meta?.balance_impact ?? "").toLowerCase();
  if (impact === "none") return false;
  if (entry.category === "ORDER_EARNING" && entry.direction === "CREDIT") return true;
  if (
    entry.category === "ORDER_ADJUSTMENT" &&
    entry.direction === "CREDIT" &&
    impact === "credit"
  ) {
    return true;
  }
  if (entry.direction === "DEBIT" && isCancellationStoreDebit(entry)) return true;
  if (entry.direction === "DEBIT" && entry.category === "PENALTY") return true;
  if (entry.direction === "DEBIT" && entry.category === "COMMISSION_DEDUCTION") return true;
  return false;
}

function sumNetWalletMovementInRange(entries: LedgerEntry[], from: Date, to: Date): number {
  const fromTs = from.getTime();
  const toTs = to.getTime();
  let sum = 0;
  for (const entry of entries) {
    if (!ledgerEntryAffectsWalletBalance(entry)) continue;
    const ts = ledgerEntryTimestamp(entry)?.getTime();
    if (ts == null || ts < fromTs || ts > toTs) continue;
    if (entry.direction === "CREDIT") sum += Number(entry.amount ?? 0);
    else if (entry.direction === "DEBIT") sum -= Number(entry.amount ?? 0);
  }
  return Math.round(sum * 100) / 100;
}

function earliestEarningTimestamp(earnings: LedgerEntry[], before?: Date): Date | null {
  const cap = before?.getTime() ?? Number.POSITIVE_INFINITY;
  let earliest: Date | null = null;
  for (const entry of earnings) {
    const d = ledgerEntryTimestamp(entry);
    if (!d || d.getTime() > cap) continue;
    if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
  }
  return earliest;
}

function periodStartAfterWithdrawal(
  withdrawalDate: Date,
  earnings: LedgerEntry[],
  before?: Date,
): Date {
  const dayAfter = dayAfterIst(withdrawalDate);
  const firstInRange = earliestEarningTimestamp(earnings, before);
  if (firstInRange && firstInRange.getTime() > dayAfter.getTime()) {
    return startOfIstDay(firstInRange);
  }
  return dayAfter;
}

export const TX_CATEGORIES = [
  "ORDER_EARNING", "ORDER_ADJUSTMENT", "WITHDRAWAL", "PENALTY",
  "SUBSCRIPTION_FEE", "COMMISSION_DEDUCTION", "BONUS", "CASHBACK",
  "REFUND_REVERSAL", "MANUAL_CREDIT", "MANUAL_DEBIT", "ADJUSTMENT",
] as const;

export type TxCategory = (typeof TX_CATEGORIES)[number];

export type TxFilter = "all" | "CREDIT" | "DEBIT" | TxCategory;

export const CAT_LABELS: Record<string, string> = {
  ORDER_EARNING: "Order Earning",
  ORDER_ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawal",
  PENALTY: "Penalty",
  SUBSCRIPTION_FEE: "Subscription",
  COMMISSION_DEDUCTION: "Commission",
  BONUS: "Bonus",
  CASHBACK: "Cashback",
  REFUND_REVERSAL: "Refund Reversal",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
  ADJUSTMENT: "Adjustment",
  COMPENSATION_CREDIT: "Compensation Credit",
  COMPENSATION_RECOVERY: "Compensation Recovery",
};

export function resolveLedgerCategoryLabel(entry: {
  category: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = entry.metadata ?? null;
  const txType = String(meta?.transaction_type ?? "").trim().toUpperCase();
  if (txType && CAT_LABELS[txType]) return CAT_LABELS[txType];
  return CAT_LABELS[entry.category] ?? entry.category.replace(/_/g, " ");
}

export const TX_FILTER_CHIPS: { key: TxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "CREDIT", label: "Credits" },
  { key: "DEBIT", label: "Debits" },
  ...TX_CATEGORIES.map((c) => ({ key: c as TxFilter, label: CAT_LABELS[c] ?? c })),
];

export function txFilterToLedgerQuery(filter: TxFilter): { direction?: string; category?: string } {
  if (filter === "all") return {};
  if (filter === "CREDIT" || filter === "DEBIT") return { direction: filter };
  return { category: filter };
}

export function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatShortDate(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const mon = d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
  const yr = String(d.getFullYear()).slice(-2);
  if (!Number.isFinite(day) || mon === "Invalid Date") return "—";
  return `${day} ${mon}'${yr}`;
}

export function formatPeriodRange(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const sDay = start.getDate();
  const eDay = end.getDate();
  const mon = end.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
  const yr = String(end.getFullYear()).slice(-2);
  if (!Number.isFinite(sDay) || !Number.isFinite(eDay) || mon === "Invalid Date") return "—";
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${sDay} - ${eDay} ${mon}'${yr}`;
  }
  const sMon = start.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
  return `${sDay} ${sMon} - ${eDay} ${mon}'${yr}`;
}

function withdrawalStatus(entry: LedgerEntry): PayoutStatus {
  const s = (entry.status ?? "COMPLETED").toUpperCase();
  if (s === "PENDING") return "PROCESSING";
  if (s === "FAILED" || s === "REVERSED") return "FAILED";
  return "PAID";
}

function countOrdersInRange(earnings: LedgerEntry[], from: Date, to: Date): number {
  const fromTs = from.getTime();
  const toTs = to.getTime();
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) return 0;
  return earnings.filter((e) => {
    const d = ledgerEntryTimestamp(e);
    if (!d) return false;
    const t = d.getTime();
    return t >= fromTs && t <= toTs;
  }).length;
}

export function buildPayoutCards(ledger: LedgerEntry[]): PayoutCard[] {
  const earnings = ledger.filter(
    (e) => e.category === "ORDER_EARNING" && e.direction === "CREDIT"
  );
  const withdrawals = ledger
    .filter((e) => e.category === "WITHDRAWAL")
    .map((w) => ({ entry: w, payoutDate: ledgerEntryTimestamp(w) }))
    .filter((w): w is { entry: LedgerEntry; payoutDate: Date } => w.payoutDate != null)
    .sort((a, b) => b.payoutDate.getTime() - a.payoutDate.getTime());

  const now = new Date();
  const cards: PayoutCard[] = [];

  const currentEnd = endOfIstDay(now);
  let currentStart: Date;
  if (withdrawals.length > 0) {
    currentStart = dayAfterIst(withdrawals[0].payoutDate);
  } else {
    const first = earliestEarningTimestamp(earnings);
    currentStart = first ? startOfIstDay(first) : startOfIstDay(now);
  }

  cards.push({
    id: "current-cycle",
    netPayout: Math.max(0, sumNetWalletMovementInRange(ledger, currentStart, currentEnd)),
    orderCount: selectPayoutOrderLedgerEntries(
      entriesInPayoutPeriod(ledger, currentStart, currentEnd, null),
    ).length,
    periodStart: currentStart,
    periodEnd: currentEnd,
    payoutDate: null,
    status: "ACCRUING",
    isCurrentCycle: true,
  });

  for (let i = 0; i < withdrawals.length; i++) {
    const { entry: w, payoutDate } = withdrawals[i];
    const periodEnd = endOfIstDay(payoutDate);
    const periodStart =
      i + 1 < withdrawals.length
        ? periodStartAfterWithdrawal(withdrawals[i + 1].payoutDate, earnings, periodEnd)
        : (() => {
            const first = earliestEarningTimestamp(earnings, periodEnd);
            return first ? startOfIstDay(first) : startOfIstDay(payoutDate);
          })();

    cards.push({
      id: `w-${w.id}`,
      netPayout: w.amount,
      orderCount: countOrdersInRange(earnings, periodStart, periodEnd),
      periodStart,
      periodEnd,
      payoutDate,
      status: withdrawalStatus(w),
      sourceEntry: w,
    });
  }

  return cards;
}

export function entriesInPayoutPeriod(
  ledger: LedgerEntry[],
  periodStart: Date | null,
  periodEnd: Date | null,
  payoutDate: Date | null,
): LedgerEntry[] {
  const fromDate = periodStart ?? payoutDate;
  const toDate = periodEnd ?? payoutDate;
  if (!fromDate || !toDate) return [];
  const from = fromDate.getTime();
  const to = toDate.getTime();
  return ledger.filter((e) => {
    const d = ledgerEntryTimestamp(e);
    if (!d) return false;
    const t = d.getTime();
    return t >= from && t <= to;
  });
}

export type SettlementSummary = MerchantPayoutSettlementClient;

export type PayoutSettlementSummary = SettlementSummary;

export const mapPayoutSettlementApiResponse = mapSettlementApiResponse;

function sumMetaAcrossEntries(entries: LedgerEntry[], keys: string[]): number {
  let sum = 0;
  for (const entry of entries) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) continue;
    for (const key of keys) {
      const v = meta[key];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n !== 0) {
        sum += Math.abs(n);
        break;
      }
    }
  }
  return sum;
}

/** Store offer discount lines for payout section B (GatiMitra merchant_offers types). */
export const PAYOUT_STORE_OFFER_DISCOUNT_LINES = [
  { key: "couponOfferDiscount" as const, label: "Coupon offers" },
  { key: "percentageFlatOfferDiscount" as const, label: "Percentage & flat offers" },
  { key: "comboOfferDiscount" as const, label: "BOGO, bundle & free item offers" },
  { key: "freeDeliveryOfferDiscount" as const, label: "Free delivery offers" },
];

export const PAYOUT_CUSTOMER_COMPENSATION_LABEL =
  "Customer compensation / cancellation refund";

export const PAYOUT_CANCELLATION_COMPENSATION_LABEL =
  "Cancellation compensation (merchant credit)";

export const PAYOUT_STORE_OFFERS_SECTION_LABEL = "Store offer discounts (B)";

export type SettlementBreakdownLine = {
  label: string;
  amount: number;
  negative?: boolean;
  green?: boolean;
};

export function buildSettlementDetailSections(settlement: SettlementSummary): {
  deductionItems: SettlementBreakdownLine[];
  creditItems: SettlementBreakdownLine[];
  estPayoutLabel: string;
} {
  const deductionItems: SettlementBreakdownLine[] = [
    { label: "Payment mechanism fee", amount: settlement.mechanismFee, negative: true },
  ];
  if (settlement.customerCompensation > 0) {
    deductionItems.push({
      label: PAYOUT_CUSTOMER_COMPENSATION_LABEL,
      amount: settlement.customerCompensation,
      negative: true,
    });
  }
  const creditItems: SettlementBreakdownLine[] =
    settlement.cancellationCompensation > 0
      ? [
          {
            label: PAYOUT_CANCELLATION_COMPENSATION_LABEL,
            amount: settlement.cancellationCompensation,
            green: true,
          },
        ]
      : [];
  const estPayoutLabel =
    settlement.cancellationCompensation > 0
      ? "Est. payout (net earnings − compensation + credits)"
      : "Est. payout (net earnings − compensation)";
  return { deductionItems, creditItems, estPayoutLabel };
}

export function computeSettlement(entries: LedgerEntry[]): SettlementSummary {
  return mapSettlementToClient(computeSettlementFromLedgerEntries(entries));
}

export function statusBadgeStyle(status: PayoutStatus) {
  switch (status) {
    case "PAID":
      return { bg: "#E8F5E9", text: "#2E7D32" };
    case "PROCESSING":
      return { bg: "#FFF3E0", text: "#E65100" };
    case "FAILED":
      return { bg: "#FFEBEE", text: "#C62828" };
    default:
      return { bg: "#FFF3E0", text: "#E65100" };
  }
}

export function statusLabel(status: PayoutStatus): string {
  switch (status) {
    case "PAID":
      return "SETTLED";
    case "PROCESSING":
      return "PROCESSING";
    case "FAILED":
      return "FAILED";
    default:
      return "TO BE PAID";
  }
}

export type OrderSettlementBadgeVariant = "settled" | "to_be_paid" | "processing" | "failed";

export function orderSettlementBadge(
  payoutStatus: PayoutStatus,
): { label: string; variant: OrderSettlementBadgeVariant } {
  switch (payoutStatus) {
    case "PAID":
      return { label: "SETTLED", variant: "settled" };
    case "PROCESSING":
      return { label: "PROCESSING", variant: "processing" };
    case "FAILED":
      return { label: "FAILED", variant: "failed" };
    default:
      return { label: "TO BE PAID", variant: "to_be_paid" };
  }
}

export function payoutCardToParams(card: PayoutCard): Record<string, string> {
  return {
    id: card.id,
    netPayout: String(card.netPayout),
    orderCount: String(card.orderCount),
    periodStart: card.periodStart?.toISOString() ?? "",
    periodEnd: card.periodEnd?.toISOString() ?? "",
    payoutDate: card.payoutDate?.toISOString() ?? "",
    status: card.status,
    isCurrentCycle: card.isCurrentCycle ? "1" : "",
    ledgerEntryId: card.sourceEntry?.id != null ? String(card.sourceEntry.id) : "",
    pgTransactionId: card.sourceEntry?.pg_transaction_id ?? "",
  };
}

export type OrderPayoutBreakdown = {
  entry: LedgerEntry;
  displayOrderId: string;
  formattedOrderId: string | null;
  ordersCoreId: number | null;
  deliveredLabel: string;
  paymentLabel: string;
  grossRevenue: number;
  netReceivable: number;
  unsettledAmount: number;
  isSettled: boolean;
  foodOrderId: number | null;
  fulfillmentStatus: "delivered" | "rejected";
  cancellationMessage: string | null;
  cancellationBrandPrefix: string | null;
  cancellationPolicySentence: string | null;
  showCompensationPolicyLink: boolean;
};

export type PayoutOrderTypeFilter = "all" | "delivered" | "rejected";

export const PAYOUT_ORDER_TYPE_OPTIONS: { id: PayoutOrderTypeFilter; label: string }[] = [
  { id: "all", label: "All orders" },
  { id: "delivered", label: "Delivered" },
  { id: "rejected", label: "Rejected" },
];

export function payoutOrderTypeFilterLabel(filter: PayoutOrderTypeFilter): string {
  return PAYOUT_ORDER_TYPE_OPTIONS.find((o) => o.id === filter)?.label ?? "All orders";
}

export function isPayoutOrderLedgerEntry(entry: LedgerEntry): boolean {
  if (entry.category === "ORDER_EARNING" && entry.direction === "CREDIT") return true;
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  if (meta?.entry_type === "order_cancellation") return true;
  if (entry.category === "ORDER_ADJUSTMENT" && (entry.reference_id || entry.order_id)) return true;
  return false;
}

export function resolveOrderFulfillmentStatus(entry: LedgerEntry): "delivered" | "rejected" {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const status = String(meta?.order_status ?? meta?.fulfillment_status ?? "").toUpperCase();
  if (status === "REJECTED" || status === "CANCELLED" || status === "RTO") return "rejected";
  if (meta?.entry_type === "order_cancellation") return "rejected";
  const desc = (entry.description ?? "").toLowerCase();
  if (desc.includes("cancel") || desc.includes("reject")) return "rejected";
  if (entry.category === "ORDER_ADJUSTMENT" && entry.direction === "DEBIT") return "rejected";
  return "delivered";
}

export function selectPayoutOrderLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    if (!isPayoutOrderLedgerEntry(entry)) continue;
    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return Array.from(groups.values())
    .map(pickPrimaryPayoutOrderEntry)
    .sort((a, b) => {
      const ta = ledgerEntryTimestamp(a)?.getTime() ?? 0;
      const tb = ledgerEntryTimestamp(b)?.getTime() ?? 0;
      return tb - ta;
    });
}

function mergeOrderLedgerMeta(entries: LedgerEntry[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) continue;
    Object.assign(merged, meta);
  }
  const foodReason = metaString(merged, "food_rejected_reason");
  if (foodReason) {
    merged.rejected_reason = foodReason;
    merged.reason_detail = foodReason;
  }
  return merged;
}

function pickPrimaryPayoutOrderEntry(entries: LedgerEntry[]): LedgerEntry {
  const cancellation = entries.find((e) => {
    const meta = (e.metadata ?? null) as Record<string, unknown> | null;
    return meta?.entry_type === "order_cancellation";
  });
  const earning = entries.find(
    (e) => e.category === "ORDER_EARNING" && e.direction === "CREDIT",
  );
  const primary = cancellation ?? earning ?? entries[0];
  const mergedMeta = mergeOrderLedgerMeta(entries);
  const formattedOrderId =
    primary.formatted_order_id ??
    earning?.formatted_order_id ??
    cancellation?.formatted_order_id ??
    null;
  return {
    ...primary,
    formatted_order_id: formattedOrderId,
    metadata: mergedMeta,
    order_id:
      primary.order_id ??
      earning?.order_id ??
      cancellation?.order_id ??
      null,
  };
}

export function filterPayoutOrderBreakdowns(
  items: OrderPayoutBreakdown[],
  filter: PayoutOrderTypeFilter,
): OrderPayoutBreakdown[] {
  if (filter === "all") return items;
  return items.filter((item) => item.fulfillmentStatus === filter);
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v.trim() : "";
}

export const MERCHANT_GROSS_REVENUE_LABEL = "Gross Revenue";

export function resolveLedgerFormattedOrderId(
  entry: LedgerEntry,
  meta: Record<string, unknown> | null | undefined,
): string | null {
  const fromEntry = String(entry.formatted_order_id ?? "").trim();
  if (fromEntry) return fromEntry.replace(/^#/, "");
  const fromMeta = metaString(meta, "formatted_order_id");
  if (fromMeta) return fromMeta.replace(/^#/, "");
  return null;
}

export function isCancellationNoCreditLedgerEntry(entry: LedgerEntry): boolean {
  const meta = entry.metadata as Record<string, unknown> | null | undefined;
  return meta?.entry_type === "order_cancellation" && meta?.balance_impact === "none";
}

const WITHDRAWAL_COMPLETED_DESCRIPTION =
  "Funds have been successfully transferred to the registered bank account.";

export function resolveLedgerDisplayDescription(entry: LedgerEntry): string {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const desc = entry.description?.trim() ?? "";

  if (/^Withdrawal completed #\d+$/i.test(desc)) {
    return WITHDRAWAL_COMPLETED_DESCRIPTION;
  }

  if (meta?.entry_type === "order_cancellation") {
    const eligible = String(meta.eligible_message ?? "").trim();
    if (eligible) {
      const orderId = resolveLedgerFormattedOrderId(entry, meta);
      if (orderId && !eligible.toLowerCase().includes(orderId.toLowerCase())) {
        return `Order ${orderId} — ${eligible}`;
      }
      if (/no merchant credit/i.test(desc) || !desc) return eligible;
    }
    if (/no merchant credit/i.test(desc)) {
      const policy = String(meta.applied_policy_title ?? "").trim();
      const reason =
        String(meta.reason_detail ?? meta.rejected_reason ?? meta.food_rejected_reason ?? "").trim();
      const brand = String(meta.cancelled_by_brand ?? "GatiMitra").trim();
      const orderId = resolveLedgerFormattedOrderId(entry, meta) ?? "Order";
      const reasonPart = reason ? `Cancelled by ${brand}: ${reason}` : `Cancelled by ${brand}`;
      const why = policy
        ? `No compensation — ${policy}`
        : "No compensation as per cancellation policy";
      return `Order ${orderId} · ${reasonPart}. ${why}`;
    }
  }

  return desc;
}

export type LedgerAmountDisplay = {
  text: string;
  accent: "credit" | "debit" | "neutral";
  compensationPolicy?: {
    orderCtm: number;
    receivedAmount: number;
  };
};

function ledgerMetaAmount(
  meta: Record<string, unknown> | null | undefined,
  keys: string[],
): number {
  if (!meta) return 0;
  for (const key of keys) {
    const v = meta[key];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function roundMerchantMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveMerchantDiscountFromMeta(
  meta: Record<string, unknown> | null | undefined,
): number {
  if (!meta) return 0;
  const direct = Math.max(
    metaNumber(meta, "merchant_funded_discount"),
    metaNumber(meta, "restaurant_discount"),
    metaNumber(meta, "coupon_discount"),
  );
  if (direct > 0) return direct;
  return Math.max(
    0,
    metaNumber(meta, "percentage_flat_offer_discount") + metaNumber(meta, "coupon_offer_discount"),
  );
}

/** Frozen merchant CTM — aligned with order details. */
export function resolveMerchantCtmFromMeta(
  meta: Record<string, unknown> | null | undefined,
  fallbackAmount = 0,
): number {
  const frozen = ledgerMetaAmount(meta, [
    "total_ctm",
    "merchant_ctm",
    "food_items_total_value",
    "net_order_value",
  ]);
  if (frozen > 0) return roundMerchantMoney(frozen);

  const fromPricing =
    metaNumber(meta, "merchant_order_total") || metaNumber(meta, "pricing_total");
  if (fromPricing > 0) return roundMerchantMoney(fromPricing);

  const itemSubtotal =
    metaNumber(meta, "item_subtotal") ||
    metaNumber(meta, "item_total") ||
    metaNumber(meta, "items_total") ||
    metaNumber(meta, "subtotal");
  const packaging =
    metaNumber(meta, "packaging_charge") ||
    metaNumber(meta, "packaging_charges") ||
    metaNumber(meta, "packaging");
  const discount = resolveMerchantDiscountFromMeta(meta);
  const fromBill = itemSubtotal + packaging - discount;
  if (fromBill > 0) return roundMerchantMoney(fromBill);

  const gross = itemSubtotal + packaging;
  if (gross > 0) return roundMerchantMoney(gross);

  const explicitGross = metaNumber(meta, "merchant_gross_revenue");
  if (explicitGross > 0) return roundMerchantMoney(explicitGross);

  const fallback = Number(fallbackAmount);
  return roundMerchantMoney(Number.isFinite(fallback) && fallback > 0 ? fallback : 0);
}

/** Merchant bill total (CTM) for payout cards and ledger — never customer CTC. */
export function resolveMerchantGrossCtm(
  meta: Record<string, unknown> | null | undefined,
): number {
  return resolveMerchantCtmFromMeta(meta, 0);
}

export function isCompensationPolicyLedgerEntry(entry: LedgerEntry): boolean {
  const meta = entry.metadata as Record<string, unknown> | null | undefined;
  return meta?.entry_type === "order_cancellation" && Boolean(meta?.compensation_engine);
}

export function resolveCompensationPolicyAmounts(
  entry: LedgerEntry,
): { orderCtm: number; receivedAmount: number } | null {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  if (!meta || meta.entry_type !== "order_cancellation") {
    return null;
  }

  const impact = String(meta.balance_impact ?? "").toLowerCase();
  const isPolicyRow =
    Boolean(meta.compensation_engine) ||
    impact === "none" ||
    (impact === "credit" && entry.direction === "CREDIT");
  if (!isPolicyRow) return null;

  const fallbackCtm =
    String(meta.balance_impact ?? "").toLowerCase() === "none"
      ? Math.max(0, Number(entry.amount ?? 0))
      : 0;
  const orderCtm = resolveMerchantCtmFromMeta(meta, fallbackCtm);

  let receivedAmount = ledgerMetaAmount(meta, [
    "merchant_keeps_amount",
    "cancellation_compensation",
  ]);
  if (receivedAmount <= 0 && impact === "credit" && entry.direction === "CREDIT") {
    receivedAmount = Math.max(0, Number(entry.amount ?? 0));
  }
  if (impact === "none") {
    receivedAmount = Math.max(0, receivedAmount);
  }

  if (orderCtm <= 0) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    orderCtm: round2(orderCtm),
    receivedAmount: round2(receivedAmount),
  };
}

export function resolveLedgerDisplayAmount(entry: LedgerEntry): LedgerAmountDisplay {
  const compensation = resolveCompensationPolicyAmounts(entry);
  if (compensation) {
    const { receivedAmount } = compensation;
    return {
      text: receivedAmount > 0 ? `+${formatCurrency(receivedAmount)}` : formatCurrency(0),
      accent: receivedAmount > 0 ? "credit" : "neutral",
      compensationPolicy: compensation,
    };
  }

  if (isCancellationNoCreditLedgerEntry(entry)) {
    return { text: formatCurrency(0), accent: "neutral" };
  }
  const isCredit = entry.direction === "CREDIT";
  return {
    text: `${isCredit ? "+" : "−"}${formatCurrency(entry.amount)}`,
    accent: isCredit ? "credit" : "debit",
  };
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number {
  const v = meta?.[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasCompensationMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  return Boolean(
    meta.compensation_engine ||
      meta.compensation_pct != null ||
      meta.merchant_keeps_amount != null,
  );
}

/** What the merchant actually receives for this order in the payout. */
export function resolveOrderNetReceivable(
  entry: LedgerEntry,
  meta: Record<string, unknown> | null,
  fulfillmentStatus: "delivered" | "rejected",
): number {
  if (fulfillmentStatus === "rejected") {
    if (hasCompensationMeta(meta)) {
      if (meta?.merchant_keeps_amount != null) {
        return Math.max(0, metaNumber(meta, "merchant_keeps_amount"));
      }
      const pct = metaNumber(meta, "compensation_pct");
      const netOrderValue = metaNumber(meta, "net_order_value");
      if (netOrderValue > 0) {
        return Math.max(0, roundMoney((netOrderValue * pct) / 100));
      }
    }

    if (meta?.entry_type === "order_cancellation") {
      return 0;
    }

    const merchantNet = metaNumber(meta, "merchant_net");
    if (merchantNet > 0) return merchantNet;
    return 0;
  }

  if (entry.category === "ORDER_EARNING" && entry.direction === "CREDIT") {
    const fromMeta = metaNumber(meta, "merchant_net");
    if (fromMeta > 0) return fromMeta;
    return Math.max(0, Number(entry.amount ?? 0));
  }

  return Math.max(0, Number(entry.amount ?? 0));
}

function resolveCancellationDisplay(meta: Record<string, unknown> | null): {
  cancelReason: string | null;
  brandPrefix: string | null;
  policySentence: string | null;
  showPolicyLink: boolean;
} {
  const raw = metaString(meta, "eligible_message");
  const rejectedReason =
    metaString(meta, "food_rejected_reason") ||
    metaString(meta, "rejected_reason");
  const brandFromMeta = metaString(meta, "cancelled_by_brand");
  const reasonFromMeta = metaString(meta, "reason_detail");

  if (raw) {
    const split = splitCancellationEligibleMessage(raw);
    const cancelReason = rejectedReason || split.cancelReason || reasonFromMeta || null;
    return {
      cancelReason,
      brandPrefix: split.brandPrefix ?? (brandFromMeta ? `Cancelled by ${brandFromMeta}:` : null),
      policySentence: split.policySentence,
      showPolicyLink: Boolean(meta?.compensation_engine),
    };
  }

  if (brandFromMeta || rejectedReason || reasonFromMeta) {
    return {
      cancelReason: rejectedReason || reasonFromMeta || null,
      brandPrefix: brandFromMeta ? `Cancelled by ${brandFromMeta}:` : null,
      policySentence: null,
      showPolicyLink: Boolean(meta?.compensation_engine),
    };
  }

  return {
    cancelReason: null,
    brandPrefix: null,
    policySentence: null,
    showPolicyLink: false,
  };
}

export function formatOrderPayoutDateTime(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return "—";
  const parts = d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return parts.replace(",", "");
}

export function buildOrderPayoutBreakdown(
  entry: LedgerEntry,
  payoutStatus: PayoutStatus,
): OrderPayoutBreakdown {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const grossRevenue = resolveMerchantGrossCtm(meta);

  const isSettled = payoutStatus === "PAID";
  const fulfillmentStatus = resolveOrderFulfillmentStatus(entry);
  const netReceivable = resolveOrderNetReceivable(entry, meta, fulfillmentStatus);
  const unsettledAmount = isSettled ? 0 : Math.max(0, netReceivable);
  const cancellationDisplay = resolveCancellationDisplay(meta);

  const metaFormatted = resolveLedgerFormattedOrderId(entry, meta);
  const formattedOrderId = metaFormatted;
  const ordersCoreId =
    entry.order_id != null && entry.order_id > 0
      ? entry.order_id
      : (() => {
          const fromMeta = Number(meta?.orders_core_id);
          return Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : null;
        })();

  const displayOrderId = formattedOrderId
    ?? (ordersCoreId != null ? String(ordersCoreId) : String(entry.reference_id ?? entry.id));

  const paymentRaw = meta?.payment_method ?? meta?.payment_status ?? "Paid online";
  const paymentLabel = typeof paymentRaw === "string" && paymentRaw.trim()
    ? paymentRaw.replace(/_/g, " ")
    : "Paid online";

  const foodOrderId =
    entry.reference_id != null && entry.reference_id > 0
      ? entry.reference_id
      : entry.order_id != null && entry.order_id > 0
        ? entry.order_id
        : null;

  return {
    entry,
    displayOrderId,
    formattedOrderId,
    ordersCoreId,
    deliveredLabel: formatOrderPayoutDateTime(entry.created_at),
    paymentLabel,
    grossRevenue,
    netReceivable,
    unsettledAmount,
    isSettled,
    foodOrderId,
    fulfillmentStatus,
    cancellationMessage: cancellationDisplay.cancelReason,
    cancellationBrandPrefix: cancellationDisplay.brandPrefix,
    cancellationPolicySentence: cancellationDisplay.policySentence,
    showCompensationPolicyLink: cancellationDisplay.showPolicyLink,
  };
}
