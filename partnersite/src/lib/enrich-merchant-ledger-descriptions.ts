import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyCancelledByBrandToDescription,
  resolveCancelledByBrandForLedger,
} from '@/lib/merchant-cancellation-ledger-brand';

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
  if (meta.entry_type === 'order_cancellation') return true;
  const desc = String(entry.description ?? '');
  return /cancel/i.test(desc);
}

export function resolveLedgerDisplayDescription(
  entry: LedgerDescriptionEntry,
  orderCancel?: OrderCancellationContext | null
): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const triggerSource =
    typeof meta.trigger_source === 'string' ? meta.trigger_source : null;

  const storedBrand =
    typeof meta.cancelled_by_brand === 'string' ? meta.cancelled_by_brand.trim() : '';
  const brand =
    storedBrand && !/^gatimitra$/i.test(storedBrand)
      ? storedBrand
      : resolveCancelledByBrandForLedger(
          orderCancel?.cancelled_by_type ??
            (typeof meta.cancelled_by_type === 'string' ? meta.cancelled_by_type : null),
          orderCancel?.cancelled_by_label ??
            (typeof meta.cancelled_by_label === 'string' ? meta.cancelled_by_label : null),
          triggerSource
        );

  const eligible =
    typeof meta.eligible_message === 'string' ? meta.eligible_message.trim() : '';
  if (eligible) {
    const fixedEligible = applyCancelledByBrandToDescription(eligible, brand);
    const orderRef = entry.formatted_order_id
      ? `Order ${entry.formatted_order_id}`
      : '';
    return orderRef ? `${orderRef} — ${fixedEligible}` : fixedEligible;
  }

  const description = entry.description ?? '';
  if (!description.trim()) return '';

  if (isCancellationLedgerEntry(entry)) {
    return applyCancelledByBrandToDescription(description, brand);
  }

  return description;
}

async function loadOrderCancellationContext(
  db: SupabaseClient,
  orderCoreIds: number[]
): Promise<Map<number, OrderCancellationContext>> {
  const result = new Map<number, OrderCancellationContext>();
  if (orderCoreIds.length === 0) return result;

  const { data: foodRows } = await db
    .from('orders_food')
    .select('order_id, cancelled_by_type, cancelled_by_label')
    .in('order_id', orderCoreIds);

  const coreIdsMissingLabel = orderCoreIds.filter(
    (id) => !foodRows?.some((row) => Number(row.order_id) === id)
  );

  let coreRows: { id: number; cancelled_by_type: string | null }[] = [];
  if (coreIdsMissingLabel.length > 0) {
    const { data } = await db
      .from('orders_core')
      .select('id, cancelled_by_type')
      .in('id', coreIdsMissingLabel);
    coreRows = (data ?? []) as { id: number; cancelled_by_type: string | null }[];
  }

  for (const row of foodRows ?? []) {
    const id = Number(row.order_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    result.set(id, {
      cancelled_by_type: row.cancelled_by_type ?? null,
      cancelled_by_label: row.cancelled_by_label ?? null,
    });
  }

  for (const row of coreRows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0 || result.has(id)) continue;
    result.set(id, {
      cancelled_by_type: row.cancelled_by_type ?? null,
      cancelled_by_label: null,
    });
  }

  return result;
}

export async function enrichMerchantLedgerDescriptions<
  T extends LedgerDescriptionEntry,
>(db: SupabaseClient, entries: T[]): Promise<T[]> {
  if (!entries.length) return entries;

  const orderCoreIds = new Set<number>();
  for (const entry of entries) {
    if (!isCancellationLedgerEntry(entry)) continue;
    const orderId = Number(entry.order_id);
    if (Number.isFinite(orderId) && orderId > 0) orderCoreIds.add(orderId);
  }

  const cancelByOrderId = await loadOrderCancellationContext(db, [...orderCoreIds]);

  return entries.map((entry) => {
    if (!isCancellationLedgerEntry(entry)) return entry;

    const orderId = Number(entry.order_id);
    const orderCancel =
      Number.isFinite(orderId) && orderId > 0 ? cancelByOrderId.get(orderId) ?? null : null;

    const description = resolveLedgerDisplayDescription(entry, orderCancel);
    if (description === entry.description) return entry;
    return { ...entry, description };
  });
}
