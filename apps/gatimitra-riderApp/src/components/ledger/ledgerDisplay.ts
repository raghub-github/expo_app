import type { TFunction } from "i18next";
import type { RiderLedgerEntry } from "@/src/services/api/riderApi";

export function formatLedgerAmount(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatLedgerDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} • ${time}`;
}

export function ledgerCategoryLabel(entry: RiderLedgerEntry, t: TFunction): string {
  switch (entry.category) {
    case "food":
      return t("ledger.food", "Food");
    case "parcel":
      return t("ledger.parcel", "Parcel");
    case "ride":
      return t("ledger.ride", "Ride");
    case "incentives":
      return t("ledger.incentives", "Incentives");
    case "subscriptions":
      return t("ledger.subscriptions", "Subscription");
    case "penalties":
      return t("ledger.penalties", "Penalties");
    case "adjustments":
      return t("ledger.adjustments", "Adjustments");
    default:
      return entry.entryType.replace(/_/g, " ");
  }
}

export function ledgerTransactionTitle(entry: RiderLedgerEntry, t: TFunction): string {
  const entryType = entry.entryType.toLowerCase();
  const category = ledgerCategoryLabel(entry, t);

  if (entryType === "penalty_reversal") {
    return t("ledger.titlePenaltyReversal", "Penalty Credited Back");
  }
  if (entryType === "subscription_fee" || entry.refType?.toLowerCase() === "subscription") {
    return t("ledger.titleSubscription", "GMitra Max Subscription");
  }
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return t("ledger.titleWithdrawal", "Withdrawal to Bank");
  }
  if (entry.flow === "debit") {
    if (entry.category === "penalties") return t("ledger.titlePenalty", "Penalty Deduction");
    if (entry.category === "adjustments") return t("ledger.titleAdjustment", "Wallet Adjustment");
    return `${category} ${t("ledger.deduction", "Deduction")}`;
  }
  if (entry.category === "incentives") return t("ledger.titleIncentive", "Incentive Credit");
  if (entry.category === "adjustments") return t("ledger.titleAdjustmentCredit", "Adjustment Credit");
  if (entry.category === "food") return t("ledger.titleFoodEarnings", "Food Delivery Earnings");
  if (entry.category === "parcel") return t("ledger.titleParcelEarnings", "Parcel Delivery Earnings");
  if (entry.category === "ride") return t("ledger.titleRideEarnings", "Ride Earnings");
  return t("ledger.titleEarnings", "{{category}} Delivery Earnings", { category });
}

export function ledgerStatusLabel(entry: RiderLedgerEntry, t: TFunction): string {
  const entryType = entry.entryType.toLowerCase();
  if (entryType === "withdrawal") return t("ledger.statusDebited", "Debited");
  if (entry.flow === "debit") return t("ledger.statusDebited", "Debited");
  if (entryType === "bonus" || entryType === "referral_bonus") {
    return t("ledger.statusCredited", "Credited");
  }
  return t("ledger.created", "Created");
}

export type LedgerVisualKind = "food" | "ride" | "incentive" | "parcel" | "withdrawal" | "adjustment";

export type LedgerVisualConfig = {
  kind: LedgerVisualKind;
  iconSet: "ionicons" | "material";
  icon: string;
  iconColor: string;
  iconBg: string;
  statusBg: string;
  statusColor: string;
};

const LEDGER_STATUS_CREDIT = { statusBg: "#DCFCE7", statusColor: "#15803D" };
const LEDGER_STATUS_DEBIT = { statusBg: "#FEE2E2", statusColor: "#B91C1C" };

function withFlowStatus(
  config: LedgerVisualConfig,
  entry: RiderLedgerEntry,
): LedgerVisualConfig {
  if (entry.flow === "debit") {
    return { ...config, ...LEDGER_STATUS_DEBIT };
  }
  return { ...config, ...LEDGER_STATUS_CREDIT };
}

export function ledgerVisualConfig(entry: RiderLedgerEntry): LedgerVisualConfig {
  const entryType = entry.entryType.toLowerCase();

  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return withFlowStatus(
      {
        kind: "withdrawal",
        iconSet: "ionicons",
        icon: "business-outline",
        iconColor: "#DC2626",
        iconBg: "#FEE2E2",
        statusBg: "#FEE2E2",
        statusColor: "#B91C1C",
      },
      entry,
    );
  }
  if (entryType === "subscription_fee" || entry.refType?.toLowerCase() === "subscription") {
    return withFlowStatus(
      {
        kind: "adjustment",
        iconSet: "ionicons",
        icon: "star-outline",
        iconColor: "#7C3AED",
        iconBg: "#EDE9FE",
        statusBg: "#FEE2E2",
        statusColor: "#B91C1C",
      },
      entry,
    );
  }
  if (entry.category === "incentives" || entryType === "bonus" || entryType === "referral_bonus") {
    return withFlowStatus(
      {
        kind: "incentive",
        iconSet: "ionicons",
        icon: "gift-outline",
        iconColor: "#EA580C",
        iconBg: "#FFEDD5",
        statusBg: "#DCFCE7",
        statusColor: "#15803D",
      },
      entry,
    );
  }
  if (entry.category === "parcel") {
    return withFlowStatus(
      {
        kind: "parcel",
        iconSet: "ionicons",
        icon: "cube-outline",
        iconColor: "#7C3AED",
        iconBg: "#EDE9FE",
        statusBg: "#DCFCE7",
        statusColor: "#15803D",
      },
      entry,
    );
  }
  if (entry.category === "ride") {
    return withFlowStatus(
      {
        kind: "ride",
        iconSet: "material",
        icon: "motorbike",
        iconColor: "#2563EB",
        iconBg: "#DBEAFE",
        statusBg: "#DCFCE7",
        statusColor: "#15803D",
      },
      entry,
    );
  }
  if (entry.category === "adjustments" || entry.category === "penalties") {
    const isPenaltyReversal = entry.entryType.toLowerCase() === "penalty_reversal";
    return withFlowStatus(
      {
        kind: "adjustment",
        iconSet: "ionicons",
        icon: isPenaltyReversal ? "checkmark-circle-outline" : "wallet-outline",
        iconColor: isPenaltyReversal ? "#15803D" : "#475569",
        iconBg: isPenaltyReversal ? "#DCFCE7" : "#F1F5F9",
        statusBg: entry.flow === "debit" ? "#FEE2E2" : "#DCFCE7",
        statusColor: entry.flow === "debit" ? "#B91C1C" : "#15803D",
      },
      entry,
    );
  }
  return withFlowStatus(
    {
      kind: "food",
      iconSet: "material",
      icon: "food",
      iconColor: "#16A34A",
      iconBg: "#DCFCE7",
      statusBg: "#DCFCE7",
      statusColor: "#15803D",
    },
    entry,
  );
}

export function ledgerEarningBanner(entry: RiderLedgerEntry, t: TFunction): string {
  const entryType = entry.entryType.toLowerCase();
  const desc = entry.description?.trim() ?? "";

  if (entryType === "penalty_reversal") {
    return "";
  }

  const dashSplit = desc.split(/\s*[—–-]\s*/);
  const lead = dashSplit[0]?.trim();
  if (lead && !/^order\b/i.test(lead)) {
    return lead;
  }

  const ref = entry.ref?.toLowerCase() ?? "";
  if (entryType.includes("tip") || ref.includes("tip")) {
    return t("ledger.customerTip", "Customer Tip");
  }
  if (entryType === "bonus" || entryType === "referral_bonus") {
    return t("ledger.incentiveBonus", "Incentive Bonus");
  }
  if (entryType === "subscription_fee" || entry.refType?.toLowerCase() === "subscription") {
    return t("ledger.subscriptionFee", "Subscription fee");
  }
  if (entryType === "withdrawal" || entry.refType?.toLowerCase() === "withdrawal") {
    return t("ledger.bankTransfer", "Bank Transfer");
  }
  if (entry.flow === "credit") {
    return t("ledger.deliveryEarning", "Delivery Earning");
  }
  return t("ledger.walletDebit", "Wallet Debit");
}

function isRealOrderRef(ref: string, refType: string): boolean {
  if (refType === "order") return true;
  if (/^GMF\d+/i.test(ref)) return true;
  if (/^GM[A-Z]+\d+/i.test(ref)) return true;
  return false;
}

export function ledgerOrderId(entry: RiderLedgerEntry): string | null {
  const fromApi = entry.orderPublicId?.trim();
  if (fromApi) return fromApi.replace(/[.,]$/, "");

  const fromDesc = entry.description?.match(/Order\s#?\s*(\S+)/i)?.[1]?.trim();
  if (fromDesc) return fromDesc.replace(/[.,]$/, "");

  const ref = entry.ref?.trim();
  if (!ref) return null;

  const refType = entry.refType?.toLowerCase() ?? "";
  const entryType = entry.entryType.toLowerCase();

  if (entryType === "subscription_fee" || refType === "subscription") return null;
  if (ref.startsWith("rider_sub_") || ref.startsWith("subscription_")) return null;
  if (ref.startsWith("rider_cancel_pen:")) return null;

  if (isRealOrderRef(ref, refType)) return ref;

  return null;
}

export function ledgerOrderIdLine(entry: RiderLedgerEntry, t: TFunction): string | null {
  const orderId = ledgerOrderId(entry);
  if (!orderId) return null;
  return t("ledger.orderIdLine", "Order Id - {{id}}", { id: orderId });
}

export function groupLedgerEntriesByDay(
  entries: RiderLedgerEntry[],
  t: TFunction,
): { key: string; label: string; entries: RiderLedgerEntry[] }[] {
  const groups = new Map<string, RiderLedgerEntry[]>();
  const labels = new Map<string, string>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();

    let label: string;
    if (day.getTime() === today.getTime()) {
      label = t("ledger.today", "Today");
    } else if (day.getTime() === yesterday.getTime()) {
      label = t("ledger.yesterday", "Yesterday");
    } else {
      label = d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }

    labels.set(key, label);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  return Array.from(groups.entries()).map(([key, bucket]) => ({
    key,
    label: labels.get(key) ?? key,
    entries: bucket,
  }));
}

export function matchesLedgerSearch(entry: RiderLedgerEntry, query: string, t: TFunction): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    ledgerTransactionTitle(entry, t),
    entry.description,
    entry.ref,
    entry.orderPublicId,
    entry.entryType,
    entry.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function sumLedgerNet(entries: RiderLedgerEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (entry.flow === "credit" ? entry.amount : -entry.amount),
    0,
  );
}

export function computeTrendPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
