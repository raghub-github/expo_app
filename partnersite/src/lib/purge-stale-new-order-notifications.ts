import type { SupabaseClient } from '@supabase/supabase-js';

const STILL_NEW = new Set(['CREATED', 'NEW', 'ORDER_PLACED', 'PENDING', '']);

/**
 * Drop leftover "New order!" inbox rows whose food order is already accepted /
 * cancelled / delivered (heals rows missed by older cancel/timeout paths).
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
    const title = String(r.title ?? '').toLowerCase();
    if (!title.includes('new order')) return false;
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
    const status = statusById.get(oid);
    // Missing food row OR left accept pipeline → purge.
    if (status == null || !STILL_NEW.has(status)) {
      const nid = Number(c.id);
      if (Number.isFinite(nid)) staleIds.push(nid);
      removed.add(String(c.id));
    }
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
