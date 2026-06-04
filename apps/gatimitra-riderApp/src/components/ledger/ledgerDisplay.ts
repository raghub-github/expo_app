import type { TFunction } from "i18next";
import type { RiderLedgerEntry } from "@/src/services/api/riderApi";

export function formatLedgerAmount(amount: number): string {
  return amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
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
    case "penalties":
      return t("ledger.penalties", "Penalties");
    case "adjustments":
      return t("ledger.adjustments", "Adjustments");
    default:
      return entry.entryType.replace(/_/g, " ");
  }
}

export function ledgerTransactionTitle(entry: RiderLedgerEntry, t: TFunction): string {
  const category = ledgerCategoryLabel(entry, t);
  if (entry.flow === "debit") {
    if (entry.category === "penalties") return t("ledger.titlePenalty", "Penalty Deduction");
    if (entry.category === "adjustments") return t("ledger.titleAdjustment", "Wallet Adjustment");
    return `${category} ${t("ledger.deduction", "Deduction")}`;
  }
  if (entry.category === "incentives") return t("ledger.titleIncentive", "Incentive Credit");
  if (entry.category === "adjustments") return t("ledger.titleAdjustmentCredit", "Adjustment Credit");
  return t("ledger.titleEarnings", "{{category}} Delivery Earnings", { category });
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
