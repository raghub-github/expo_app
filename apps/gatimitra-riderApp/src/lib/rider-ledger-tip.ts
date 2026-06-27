import type { RiderLedgerEntry } from "@/src/services/api/riderApi";

export function parseRiderTipLedgerRef(
  ref: string | null | undefined
): { coreId: number } | null {
  const value = ref?.trim();
  if (!value) return null;
  const match = value.match(/^rider_earn:tip:(\d+)$/i);
  if (!match) return null;
  const coreId = Number(match[1]);
  return Number.isFinite(coreId) && coreId > 0 ? { coreId } : null;
}

export function isRiderTipLedgerCredit(entry: RiderLedgerEntry): boolean {
  if (entry.flow !== "credit") return false;
  const entryType = entry.entryType.toLowerCase();
  const ref = entry.ref?.toLowerCase() ?? "";
  const desc = entry.description?.toLowerCase() ?? "";
  if (parseRiderTipLedgerRef(entry.ref)) return true;
  if (entryType.includes("tip")) return true;
  if (ref.includes(":tip:")) return true;
  return desc.includes("customer tip") || desc.includes("tip —");
}

export function ledgerEntryMatchesOrder(
  entry: RiderLedgerEntry,
  orderId: string
): boolean {
  const needle = orderId.trim();
  if (!needle) return false;
  const publicId = entry.orderPublicId?.trim();
  if (publicId && (publicId === needle || publicId.includes(needle) || needle.includes(publicId))) {
    return true;
  }
  const desc = entry.description ?? "";
  return desc.includes(needle);
}
