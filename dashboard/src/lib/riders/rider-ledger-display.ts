/**
 * Rider wallet ledger display — keep in sync with rider app `ledgerDisplay.ts`
 * and backend `rider-wallet-ledger-app.ts`.
 */

import {
  formatLedgerServiceLabel,
  isBareCorePkId,
  isInternalLedgerRef,
  normalizeLedgerServiceType,
} from "@/lib/riders/rider-ledger-resolve";

export type RiderLedgerDisplayEntry = {
  entryType: string;
  flow: "credit" | "debit";
  category: string;
  description?: string | null;
  ref?: string | null;
  refType?: string | null;
  serviceType?: string | null;
  orderPublicId?: string | null;
  rejectionReason?: string | null;
};

/** Full set of wallet_entry_type enum values (keep in sync with DB `wallet_entry_type`). */
export const WALLET_ENTRY_TYPES = [
  "earning",
  "penalty",
  "onboarding_fee",
  "adjustment",
  "refund",
  "bonus",
  "referral_bonus",
  "withdrawal",
  "subscription_fee",
  "purchase",
  "cod_order",
  "other",
  "incentive",
  "surge",
  "failed_withdrawal_revert",
  "penalty_reversal",
  "cancellation_payout",
  "manual_add",
  "manual_deduct",
] as const;

const CREDIT_ENTRY_TYPES = new Set<string>([
  "earning",
  "bonus",
  "refund",
  "referral_bonus",
  "penalty_reversal",
  "manual_add",
  "incentive",
  "surge",
  "failed_withdrawal_revert",
  "cancellation_payout",
]);

/** Credit entry types as an array (single source of truth for API flow filters). */
export const LEDGER_CREDIT_ENTRY_TYPES: string[] = WALLET_ENTRY_TYPES.filter((t) =>
  CREDIT_ENTRY_TYPES.has(t)
);

/** Every non-credit entry type is a debit — exhaustive complement so flow filters never drop rows. */
export const LEDGER_DEBIT_ENTRY_TYPES: string[] = WALLET_ENTRY_TYPES.filter(
  (t) => !CREDIT_ENTRY_TYPES.has(t)
);

const ADJUSTMENT_ENTRY_TYPES = new Set(["adjustment", "refund", "onboarding_fee"]);
const INCENTIVE_ENTRY_TYPES = new Set([
  "bonus",
  "referral_bonus",
  "incentive",
  "surge",
]);

export function isLedgerCreditEntryType(entryType: string): boolean {
  return CREDIT_ENTRY_TYPES.has(entryType.toLowerCase());
}

/** Tips are stored as `earning` with a `rider_earn:tip:*` ref or a "tip" description. */
export function isLedgerTipEntry(entry: {
  entryType: string;
  ref?: string | null;
  description?: string | null;
}): boolean {
  const entryType = entry.entryType.toLowerCase();
  const ref = entry.ref?.toLowerCase() ?? "";
  const desc = entry.description?.toLowerCase() ?? "";
  return entryType.includes("tip") || ref.includes("tip") || /\btip\b/.test(desc);
}

export function extractWithdrawalRejectionReason(entry: {
  description?: string | null;
  rejectionReason?: string | null;
}): string {
  const fromField = entry.rejectionReason?.trim();
  if (fromField) return fromField;
  const desc = entry.description?.trim() ?? "";
  const match = desc.match(/Reason:\s*(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function isRejectedWithdrawalLedgerEntry(entry: {
  entryType: string;
  refType?: string | null;
  description?: string | null;
}): boolean {
  const entryType = entry.entryType.toLowerCase();
  if (entryType === "failed_withdrawal_revert") return true;
  const desc = entry.description?.toLowerCase() ?? "";
  return (
    (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") &&
    (desc.includes("withdrawal rejected") || desc.includes("withdrawal failed"))
  );
}

function ledgerCategoryLabel(category: string): string {
  switch (category) {
    case "food":
      return "Food";
    case "parcel":
      return "Parcel";
    case "ride":
      return "Ride";
    case "incentives":
      return "Incentives";
    case "tips":
      return "Tips";
    case "subscriptions":
      return "Subscription";
    case "penalties":
      return "Penalties";
    case "withdrawals":
      return "Withdrawal";
    case "adjustments":
      return "Adjustments";
    default:
      return category.replace(/_/g, " ");
  }
}

export function resolveLedgerCategory(entry: RiderLedgerDisplayEntry): string {
  const entryType = entry.entryType.toLowerCase();
  if (entryType === "subscription_fee") return "subscriptions";
  if (entryType === "penalty" || entryType === "penalty_reversal") return "penalties";
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return "withdrawals";
  }
  if (isLedgerTipEntry(entry)) return "tips";
  if (INCENTIVE_ENTRY_TYPES.has(entryType)) return "incentives";
  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";

  const service = entry.serviceType?.trim().toLowerCase() ?? "";
  if (service === "food") return "food";
  if (service === "parcel") return "parcel";
  if (service === "person_ride" || service === "ride") return "ride";

  if (entryType === "earning") return service || "food";
  return "other";
}

export function mapLedgerRowForDisplay(row: {
  entryType: string;
  description?: string | null;
  ref?: string | null;
  refType?: string | null;
  serviceType?: string | null;
  orderId?: string | null;
  rejectionReason?: string | null;
}): RiderLedgerDisplayEntry {
  const entryType = row.entryType.toLowerCase();
  const base: RiderLedgerDisplayEntry = {
    entryType,
    flow: isLedgerCreditEntryType(entryType) ? "credit" : "debit",
    category: "other",
    description: row.description,
    ref: row.ref,
    refType: row.refType,
    serviceType: row.serviceType,
    orderPublicId: row.orderId?.trim() || null,
    rejectionReason: row.rejectionReason ?? null,
  };
  return { ...base, category: resolveLedgerCategory(base) };
}

export function ledgerTransactionTitle(entry: RiderLedgerDisplayEntry): string {
  const entryType = entry.entryType.toLowerCase();
  const category = ledgerCategoryLabel(entry.category);

  if (entryType === "penalty_reversal") return "Penalty Credited Back";
  if (entryType === "subscription_fee" || entry.refType?.toLowerCase() === "subscription") {
    return "GMitra Max Subscription";
  }
  if (entryType === "failed_withdrawal_revert" || isRejectedWithdrawalLedgerEntry(entry)) {
    return "Withdrawal Rejected";
  }
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return "Withdrawal to Bank";
  }
  if (entry.flow === "debit") {
    if (entry.category === "penalties") return "Penalty Deduction";
    if (entry.category === "adjustments") return "Wallet Adjustment";
    if (entryType === "manual_deduct") return "Manual Deduction";
    if (entryType === "onboarding_fee") return "Onboarding Fee";
    if (entryType === "purchase") return "Purchase";
    if (entryType === "cod_order") return "COD Collected";
    return `${category} Deduction`;
  }
  if (entry.category === "tips") return "Customer Tip";
  if (entry.category === "incentives") {
    if (entryType === "surge") return "Surge Credit";
    if (entryType === "incentive") return "Incentive Credit";
    return "Incentive Bonus";
  }
  if (entryType === "refund") return "Refund Credit";
  if (entryType === "manual_add") return "Manual Credit";
  if (entryType === "cancellation_payout") return "Cancellation Payout";
  if (entry.category === "adjustments") return "Adjustment Credit";
  if (entry.category === "food") return "Food Delivery Earnings";
  if (entry.category === "parcel") return "Parcel Delivery Earnings";
  if (entry.category === "ride") return "Ride Earnings";
  return `${category} Delivery Earnings`;
}

export function ledgerEarningBanner(entry: RiderLedgerDisplayEntry): string {
  const entryType = entry.entryType.toLowerCase();
  const desc = entry.description?.trim() ?? "";

  if (entryType === "penalty_reversal") return "";

  if (entryType === "failed_withdrawal_revert" || isRejectedWithdrawalLedgerEntry(entry)) {
    return extractWithdrawalRejectionReason(entry) || "Withdrawal rejected";
  }

  const dashSplit = desc.split(/\s*[—–-]\s*/);
  const lead = dashSplit[0]?.trim();
  if (lead && !/^order\b/i.test(lead)) {
    return lead;
  }

  if (isLedgerTipEntry(entry)) return "Customer Tip";
  if (entryType === "surge") return "Surge Pay";
  if (entryType === "incentive") return "Incentive";
  if (entryType === "bonus" || entryType === "referral_bonus") return "Incentive Bonus";
  if (entryType === "cancellation_payout") return "Cancellation Payout";
  if (entryType === "refund") return "Refund";
  if (entryType === "manual_add") return "Manual Credit";
  if (entryType === "manual_deduct") return "Manual Deduction";
  if (entryType === "subscription_fee" || entry.refType?.toLowerCase() === "subscription") {
    return "Subscription fee";
  }
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return "Bank Transfer";
  }
  if (entry.flow === "credit") return "Delivery Earning";
  return "Wallet Debit";
}

function isRealOrderRef(ref: string, refType: string): boolean {
  if (refType === "order") return true;
  if (/^GMF\d+/i.test(ref)) return true;
  if (/^GM[A-Z]+\d+/i.test(ref)) return true;
  return false;
}

export function ledgerOrderPublicId(entry: RiderLedgerDisplayEntry): string | null {
  const fromApi = entry.orderPublicId?.trim();
  if (fromApi && !isInternalLedgerRef(fromApi) && !isBareCorePkId(fromApi)) {
    return fromApi.replace(/[.,]$/, "");
  }

  const fromDesc = entry.description?.match(/Order\s#?\s*(\S+)/i)?.[1]?.trim();
  if (fromDesc) return fromDesc.replace(/[.,]$/, "");

  const ref = entry.ref?.trim();
  if (!ref) return null;

  const refType = entry.refType?.toLowerCase() ?? "";
  const entryType = entry.entryType.toLowerCase();

  if (entryType === "subscription_fee" || refType === "subscription") return null;
  if (ref.startsWith("rider_sub_") || ref.startsWith("subscription_")) return null;
  if (ref.startsWith("rider_cancel_pen:")) return null;

  if (isInternalLedgerRef(ref)) return null;

  if (isRealOrderRef(ref, refType)) return ref;

  return null;
}

export { formatLedgerServiceLabel };

export function formatLedgerDisplay(row: {
  entryType: string;
  description?: string | null;
  ref?: string | null;
  refType?: string | null;
  serviceType?: string | null;
  orderId?: string | null;
  rejectionReason?: string | null;
}): {
  title: string;
  reason: string;
  orderId: string | null;
  serviceLabel: string;
  flow: "credit" | "debit";
} {
  const entry = mapLedgerRowForDisplay(row);
  const service = normalizeLedgerServiceType(row.serviceType) ?? entry.serviceType;
  return {
    title: ledgerTransactionTitle(entry),
    reason: ledgerEarningBanner(entry),
    orderId: ledgerOrderPublicId(entry),
    serviceLabel: formatLedgerServiceLabel(service),
    flow: entry.flow,
  };
}
