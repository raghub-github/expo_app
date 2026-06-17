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
};

const CREDIT_ENTRY_TYPES = new Set([
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

const ADJUSTMENT_ENTRY_TYPES = new Set(["adjustment", "refund", "onboarding_fee"]);
const INCENTIVE_ENTRY_TYPES = new Set(["bonus", "referral_bonus"]);

export function isLedgerCreditEntryType(entryType: string): boolean {
  return CREDIT_ENTRY_TYPES.has(entryType.toLowerCase());
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
    case "subscriptions":
      return "Subscription";
    case "penalties":
      return "Penalties";
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
  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";
  if (INCENTIVE_ENTRY_TYPES.has(entryType)) return "incentives";

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
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return "Withdrawal to Bank";
  }
  if (entry.flow === "debit") {
    if (entry.category === "penalties") return "Penalty Deduction";
    if (entry.category === "adjustments") return "Wallet Adjustment";
    return `${category} Deduction`;
  }
  if (entry.category === "incentives") return "Incentive Credit";
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

  const dashSplit = desc.split(/\s*[—–-]\s*/);
  const lead = dashSplit[0]?.trim();
  if (lead && !/^order\b/i.test(lead)) {
    return lead;
  }

  const ref = entry.ref?.toLowerCase() ?? "";
  if (entryType.includes("tip") || ref.includes("tip")) return "Customer Tip";
  if (entryType === "bonus" || entryType === "referral_bonus") return "Incentive Bonus";
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
