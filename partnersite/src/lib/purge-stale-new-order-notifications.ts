import type { SupabaseClient } from '@supabase/supabase-js';

const STILL_NEW = new Set(['CREATED', 'NEW', 'ORDER_PLACED', 'PENDING', '']);

/** Order finished / cancelled — clear every linked store inbox row. */
const TERMINAL = new Set([
  'DELIVERED',
  'COMPLETED',
  'COMPLETE',
  'CANCELLED',
  'CANCELED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
  'RTO_DELIVERED',
  'RTO_COMPLETED',
]);

function isNewOrderTitle(title: string | null | undefined): boolean {
  return String(title ?? '')
    .trim()
    .toLowerCase()
    .includes('new order');
}

function shouldPurgeOrderNotification(
  title: string | null | undefined,
  orderStatus: string | null | undefined
): boolean {
  const status = String(orderStatus ?? '')
    .trim()
    .toUpperCase();
  // Missing food row → stale; drop it.
  if (!status) return true;
  if (TERMINAL.has(status)) return true;
  // "New order!" only belongs in the accept pipeline.
  if (isNewOrderTitle(title) && !STILL_NEW.has(status)) return true;
  return false;
}

/**
 * Auto-clear order inbox rows when the linked food order is done (or "New order!"
 * after accept/cancel). Manual Clear all / dismiss still work independently.
 */
export async function purgeStaleNewOrderNotifications(
  db: SupabaseClient,
  storeId: number,
  rows: Array<{
    id: string | number;
    type?: string | null;
    title?: string | null;
    order_id?: string | number | null;
  }>
): Promise<Set<string>> {
  const removed = new Set<string>();
  const candidates = rows.filter((r) => {
    if (String(r.type ?? '').toLowerCase() !== 'order') return false;
    const oid = Number(r.order_id);
    return Number.isFinite(oid) && oid > 0;
  });
  if (candidates.length === 0) return removed;

  const foodIds = [
    ...new Set(
      candidates
        .map((r) => Number(r.order_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];

  const { data: foodRows, error } = await db
    .from('orders_food')
    .select('id, order_status')
    .in('id', foodIds);
  if (error) {
    console.warn('[purgeStaleNewOrderNotifications]', error.message);
    return removed;
  }

  const statusById = new Map<number, string>();
  for (const row of foodRows ?? []) {
    statusById.set(Number(row.id), String(row.order_status ?? '').trim().toUpperCase());
  }

  const staleIds: number[] = [];
  for (const c of candidates) {
    const oid = Number(c.order_id);
    const status = statusById.get(oid) ?? null;
    if (!shouldPurgeOrderNotification(c.title, status)) continue;
    const nid = Number(c.id);
    if (Number.isFinite(nid)) staleIds.push(nid);
    removed.add(String(c.id));
  }

  if (staleIds.length > 0) {
    const { error: delErr } = await db
      .from('merchant_store_notifications')
      .delete()
      .eq('store_id', storeId)
      .in('id', staleIds);
    if (delErr) {
      console.warn('[purgeStaleNewOrderNotifications] delete', delErr.message);
      removed.clear();
    }
  }

  return removed;
}

/** Shared status helpers for backend merchant-partner list purge. */
export const ORDER_NOTIFICATION_STILL_NEW = STILL_NEW;
export const ORDER_NOTIFICATION_TERMINAL = TERMINAL;
export { shouldPurgeOrderNotification };
