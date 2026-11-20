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

  const service = entry.serviceType?.trim().toLowerCase() ?? "";
  const isCashSettle =
    entryType === "cod_order" ||
    /^(?:ride|parcel)_cash_settle:\d+$/i.test(entry.ref ?? "");
  // COD platform-share is ride/parcel job money, not a manual adjustment.
  if (isCashSettle) {
    if (service === "parcel" || entry.ref?.startsWith("parcel_cash_settle:")) return "parcel";
    if (
      service === "person_ride" ||
      service === "ride" ||
      entry.ref?.startsWith("ride_cash_settle:")
    ) {
      return "ride";
    }
  }

  if (ADJUSTMENT_ENTRY_TYPES.has(entryType)) return "adjustments";

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
    if (entryType === "cod_order" || /^(?:ride|parcel)_cash_settle:\d+$/i.test(entry.ref ?? "")) {
      if (entry.category === "parcel") return "Cash Parcel · Platform Share";
      if (entry.category === "ride") return "Cash Ride · Platform Share";
      return "COD Collected";
    }
    if (entry.category === "adjustments") return "Wallet Adjustment";
    if (entryType === "manual_deduct") return "Manual Deduction";
    if (entryType === "onboarding_fee") return "Onboarding Fee";
    if (entryType === "purchase") return "Purchase";
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
  if (entryType === "cod_order" || /^(?:ride|parcel)_cash_settle:\d+$/i.test(entry.ref ?? "")) {
    return "Cash collected exceeds earning — platform share debited from wallet";
  }
  if (entry.ref?.startsWith("rider_cancel_pen:")) {
    return "Cancellation penalty debited from wallet";
  }
  if (entry.flow === "credit") return "Delivery Earning";
  if (entry.category === "penalties") return "Penalty Deduction";
  return "Wallet Debit";
}

/**
 * Recent-orders Credit/Debit subtitle — keep copy aligned with rider-app ledger titles.
 */
export function resolveOrderWalletLedgerLabel(input: {
  orderType?: string | null;
  ledgerNet: number | null;
  entries: Array<{ entryType: string; ref?: string | null }>;
}): { title: string; reason: string } | null {
  if (input.ledgerNet == null || input.entries.length === 0) return null;

  const service = String(input.orderType ?? "").trim().toLowerCase();
  const isParcel = service === "parcel";
  const isRide = service === "person_ride" || service === "ride";

  const hasCashSettle = input.entries.some((e) => {
    const ref = e.ref?.trim() ?? "";
    const type = e.entryType.toLowerCase();
    return (
      type === "cod_order" ||
      /^(?:ride|parcel)_cash_settle:\d+$/i.test(ref)
    );
  });
  const hasCancelPen = input.entries.some((e) =>
    (e.ref ?? "").startsWith("rider_cancel_pen:")
  );
  const hasEarning = input.entries.some((e) => {
    const type = e.entryType.toLowerCase();
    const ref = e.ref ?? "";
    return type === "earning" || ref.startsWith("rider_earn:");
  });

  if (input.ledgerNet < 0) {
    if (hasCashSettle) {
      return {
        title: isParcel
          ? "Cash Parcel · Platform Share"
          : isRide
            ? "Cash Ride · Platform Share"
            : "COD Collected",
        reason: "Cash collected > earning. Platform share taken from wallet.",
      };
    }
    if (hasCancelPen) {
      return {
        title: "Cancellation Penalty",
        reason: "Cancel penalty deducted from wallet.",
      };
    }
    return {
      title: "Wallet Debit",
      reason: "Amount deducted from rider wallet.",
    };
  }

  if (input.ledgerNet > 0) {
    if (hasCashSettle && hasEarning) {
      return {
        title: isParcel
          ? "Cash Parcel · Company Top-up"
          : isRide
            ? "Cash Ride · Company Top-up"
            : "Cash Settlement Credit",
        reason: "Earning > cash collected. Top-up credited to wallet.",
      };
    }
    if (hasEarning) {
      return {
        title: isParcel
          ? "Parcel Delivery Earnings"
          : isRide
            ? "Ride Earnings"
            : service === "food"
              ? "Food Delivery Earnings"
              : "Delivery Earnings",
        reason: "Delivery earning credited to wallet.",
      };
    }
    return {
      title: "Wallet Credit",
      reason: "Amount credited to rider wallet.",
    };
  }

  // Net zero wallet move after settlement (cash collected ≈ earning).
  if (hasCashSettle || hasEarning) {
    return {
      title: isParcel
        ? "Cash Parcel · Cash Collected"
        : isRide
          ? "Cash Ride · Cash Collected"
          : "Cash Collected",
      reason: "Cash = earning. No wallet change.",
    };
  }

  return null;
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
