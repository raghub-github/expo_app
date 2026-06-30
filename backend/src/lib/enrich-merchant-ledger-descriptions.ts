import type { Sql } from "postgres";
import {
  applyCancelledByBrandToDescription,
  resolveCancelledByBrandForLedger,
} from "./merchant-cancellation-ledger-brand.js";

export type LedgerDescriptionEntry = {
  id: number;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  reference_type?: string | null;
  reference_id?: number | null;
  order_id?: number | null;
  formatted_order_id?: string | null;
};

type OrderCancellationContext = {
  cancelled_by_type: string | null;
  cancelled_by_label: string | null;
};

function isCancellationLedgerEntry(entry: LedgerDescriptionEntry): boolean {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  if (meta.entry_type === "order_cancellation") return true;
  const desc = String(entry.description ?? "");
  return /cancel/i.test(desc);
}

export function resolveLedgerDisplayDescription(
  entry: LedgerDescriptionEntry,
  orderCancel?: OrderCancellationContext | null
): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const triggerSource =
    typeof meta.trigger_source === "string" ? meta.trigger_source : null;

  const storedBrand =
    typeof meta.cancelled_by_brand === "string" ? meta.cancelled_by_brand.trim() : "";
  const brand =
    storedBrand && !/^gatimitra$/i.test(storedBrand)
      ? storedBrand
      : resolveCancelledByBrandForLedger(
          orderCancel?.cancelled_by_type ??
            (typeof meta.cancelled_by_type === "string" ? meta.cancelled_by_type : null),
          orderCancel?.cancelled_by_label ??
            (typeof meta.cancelled_by_label === "string" ? meta.cancelled_by_label : null),
          triggerSource
        );

  const eligible =
    typeof meta.eligible_message === "string" ? meta.eligible_message.trim() : "";
  if (eligible) {
    const fixedEligible = applyCancelledByBrandToDescription(eligible, brand);
    const orderRef = entry.formatted_order_id
      ? `Order ${entry.formatted_order_id}`
      : "";
    return orderRef ? `${orderRef} — ${fixedEligible}` : fixedEligible;
  }

  const description = entry.description ?? "";
  if (!description.trim()) return "";

  if (isCancellationLedgerEntry(entry)) {
    return applyCancelledByBrandToDescription(description, brand);
  }

  return description;
}

async function loadOrderCancellationContextByCoreId(
  sql: Sql,
  orderCoreIds: number[]
): Promise<Map<number, OrderCancellationContext>> {
  const result = new Map<number, OrderCancellationContext>();
  if (orderCoreIds.length === 0) return result;

  const rows = await sql<
    {
      order_core_id: number;
      cancelled_by_type: string | null;
      cancelled_by_label: string | null;
    }[]
  >`
    SELECT
      c.id AS order_core_id,
      COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
      f.cancelled_by_label
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ANY(${orderCoreIds}::bigint[])
  `;

  for (const row of rows) {
    const id = Number(row.order_core_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    result.set(id, {
      cancelled_by_type: row.cancelled_by_type,
      cancelled_by_label: row.cancelled_by_label,
    });
  }

  return result;
}

async function loadOrderCancellationContextByFoodId(
  sql: Sql,
  ordersFoodIds: number[]
): Promise<Map<number, OrderCancellationContext>> {
  const result = new Map<number, OrderCancellationContext>();
  if (ordersFoodIds.length === 0) return result;

  const rows = await sql<
    {
      orders_food_id: number;
      order_core_id: number;
      cancelled_by_type: string | null;
      cancelled_by_label: string | null;
    }[]
  >`
    SELECT
      f.id AS orders_food_id,
      f.order_id AS order_core_id,
      COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
      f.cancelled_by_label
    FROM orders_food f
    JOIN orders_core c ON c.id = f.order_id
    WHERE f.id = ANY(${ordersFoodIds}::bigint[])
  `;

  for (const row of rows) {
    const foodId = Number(row.orders_food_id);
    const coreId = Number(row.order_core_id);
    const ctx: OrderCancellationContext = {
      cancelled_by_type: row.cancelled_by_type,
      cancelled_by_label: row.cancelled_by_label,
    };
    if (Number.isFinite(foodId) && foodId > 0) result.set(foodId, ctx);
    if (Number.isFinite(coreId) && coreId > 0) result.set(coreId, ctx);
  }

  return result;
}

export async function enrichMerchantLedgerDescriptions<
  T extends LedgerDescriptionEntry,
>(sql: Sql, entries: T[]): Promise<T[]> {
  if (!entries.length) return entries;

  const orderCoreIds = new Set<number>();
  const ordersFoodIds = new Set<number>();

  for (const entry of entries) {
    if (!isCancellationLedgerEntry(entry)) continue;
    const orderId = Number(entry.order_id);
    if (Number.isFinite(orderId) && orderId > 0) orderCoreIds.add(orderId);
    if (entry.reference_type === "ORDER" && entry.reference_id != null) {
      ordersFoodIds.add(Number(entry.reference_id));
    }
  }

  const [byCoreId, byFoodId] = await Promise.all([
    loadOrderCancellationContextByCoreId(sql, [...orderCoreIds]),
    loadOrderCancellationContextByFoodId(sql, [...ordersFoodIds]),
  ]);

  return entries.map((entry) => {
    if (!isCancellationLedgerEntry(entry)) return entry;

    const orderId = Number(entry.order_id);
    const foodId =
      entry.reference_type === "ORDER" && entry.reference_id != null
        ? Number(entry.reference_id)
        : null;

    const orderCancel =
      (Number.isFinite(orderId) && orderId > 0 ? byCoreId.get(orderId) : null) ??
      (foodId != null && Number.isFinite(foodId) ? byFoodId.get(foodId) : null) ??
      null;

    const description = resolveLedgerDisplayDescription(entry, orderCancel);
    if (description === entry.description) return entry;
    return { ...entry, description };
  });
}
