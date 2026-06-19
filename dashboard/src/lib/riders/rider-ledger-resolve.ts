/**
 * Resolve formatted order IDs + service labels for wallet ledger rows.
 * Keep in sync with backend `rider-wallet-ledger-app.ts`.
 */

export type LedgerOrderCoreRow = {
  id: number;
  orderType?: string | null;
  formattedOrderId?: string | null;
  orderId?: string | null;
  externalRef?: string | null;
};

export function isInternalLedgerRef(value: string): boolean {
  const v = value.trim();
  return (
    v.startsWith("rider_earn:") ||
    v.startsWith("rider_cancel_pen:") ||
    v.startsWith("rider_sub_") ||
    v.startsWith("subscription_") ||
    /^penalty[_:]/i.test(v)
  );
}

/** orders_core primary key — not a customer-facing order id. */
export function isBareCorePkId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function isDisplayableOrderPublicId(value: string): boolean {
  const v = value.trim();
  if (!v || isInternalLedgerRef(v) || isBareCorePkId(v)) return false;
  return true;
}

export function extractOrderCoreIdFromLedger(
  ref: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): number | null {
  const meta = metadata ?? {};
  for (const key of ["orderId", "ordersCoreId", "order_core_id"]) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  }

  const refText = ref?.trim() ?? "";
  const penaltyMatch = refText.match(/^rider_cancel_pen:(\d+):/);
  if (penaltyMatch) return Number(penaltyMatch[1]);

  const earningMatch = refText.match(/^rider_earn:(?:delivery|tip):(\d+)$/);
  if (earningMatch) return Number(earningMatch[1]);

  return null;
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

export function formatOrderPublicIdFromCoreRow(row: LedgerOrderCoreRow): string | null {
  const formatted = row.formattedOrderId?.trim();
  if (formatted && isDisplayableOrderPublicId(formatted)) return formatted;

  const businessId = row.orderId?.trim();
  if (businessId && isDisplayableOrderPublicId(businessId)) return businessId;

  const external = row.externalRef?.trim();
  if (external && isDisplayableOrderPublicId(external)) return external;

  return null;
}

export function resolveOrderPublicIdFromLedger(input: {
  ref: string | null;
  refType: string | null;
  metadata: Record<string, unknown> | null | undefined;
  coreRow?: LedgerOrderCoreRow | null;
}): string | null {
  const meta = input.metadata ?? {};

  if (input.coreRow) {
    const fromCore = formatOrderPublicIdFromCoreRow(input.coreRow);
    if (fromCore) return fromCore.replace(/[.,]$/, "");
  }

  const fromMeta = readMetaOrderPublicId(meta);
  if (fromMeta) return fromMeta.replace(/[.,]$/, "");

  const ref = input.ref?.trim();
  const refType = input.refType?.toLowerCase() ?? "";
  if (ref && isDisplayableOrderPublicId(ref)) {
    if (refType === "order" || /^GM[A-Z]+\d+/i.test(ref)) {
      return ref.replace(/[.,]$/, "");
    }
  }

  return null;
}

export function normalizeLedgerServiceType(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === "ride") return "person_ride";
  if (value === "food" || value === "parcel" || value === "person_ride") return value;
  return value;
}

export function resolveServiceTypeFromLedger(input: {
  serviceType: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  coreRow?: LedgerOrderCoreRow | null;
}): string | null {
  const direct = normalizeLedgerServiceType(input.serviceType);
  if (direct) return direct;

  const meta = input.metadata ?? {};
  for (const key of ["serviceType", "service_type", "service", "orderType", "order_type"]) {
    const fromMeta = normalizeLedgerServiceType(
      typeof meta[key] === "string" ? meta[key] : null
    );
    if (fromMeta) return fromMeta;
  }

  if (input.coreRow?.orderType) {
    return normalizeLedgerServiceType(input.coreRow.orderType);
  }

  return null;
}

export function formatLedgerServiceLabel(serviceType: string | null | undefined): string {
  const service = normalizeLedgerServiceType(serviceType);
  if (!service) return "—";
  switch (service) {
    case "food":
      return "Food";
    case "parcel":
      return "Parcel";
    case "person_ride":
      return "Person ride";
    default:
      return service.replace(/_/g, " ");
  }
}
