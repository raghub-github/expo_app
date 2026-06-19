import type {
  CancellationReasonCatalogGrouped,
  CancellationReasonCatalogRow,
} from "@/lib/db/operations/order-cancellation-reason-catalog";

/** Cancellation attribute code (loaded from DB; not hardcoded). */
export type OrderRejectionAttribute = string;

export type CancellationAttributeOption = {
  code: string;
  displayLabel: string;
  defaultFault: string;
  sortOrder: number;
};

/** Normalize catalog row id from DB/JSON (number, string, bigint). */
export function normalizeCatalogReasonId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function reasonsForAttribute(
  grouped: CancellationReasonCatalogGrouped,
  attributeCode: string
): CancellationReasonCatalogRow[] {
  const code = attributeCode.trim();
  if (!code) return [];
  if (grouped[code]?.length) return grouped[code];
  const upper = code.toUpperCase();
  if (grouped[upper]?.length) return grouped[upper];
  const matchKey = Object.keys(grouped).find((k) => k.toUpperCase() === upper);
  return matchKey ? grouped[matchKey] : [];
}

export function findCatalogReasonBySelectValue(
  options: CancellationReasonCatalogRow[],
  selectValue: string
): CancellationReasonCatalogRow | null {
  if (!selectValue.trim()) return null;
  const id = normalizeCatalogReasonId(selectValue);
  if (id == null) return null;
  return options.find((r) => normalizeCatalogReasonId(r.id) === id) ?? null;
}

export function catalogReasonOptionValue(row: CancellationReasonCatalogRow): string {
  return String(normalizeCatalogReasonId(row.id) ?? row.id);
}

/** Catalog row for admin cancel-without-refund (attribute OTHER). */
export function findCancelledWithoutRefundReason(
  grouped: CancellationReasonCatalogGrouped
): CancellationReasonCatalogRow | null {
  for (const rows of Object.values(grouped)) {
    for (const row of rows) {
      const label = row.label.trim().toLowerCase();
      const code = String(row.reasonCode ?? "").trim().toLowerCase();
      if (
        code === "cancelled_without_refund" ||
        code === "canceled_without_refund" ||
        label === "cancelled without refund" ||
        label === "canceled without refund"
      ) {
        return row;
      }
    }
  }
  return null;
}
