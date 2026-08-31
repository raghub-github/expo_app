import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import {
  isWithinAcceptanceDeadline,
  loadAcceptanceWindowMinutes,
} from '@/lib/order-acceptance-timeout-sync';

/**
 * Orders still awaiting merchant accept (New orders / CREATED pipeline).
 * Does not treat orders_core.status = "assigned" as pending — that flag stays
 * on many completed/cancelled rows.
 */
export async function countPendingNewOrders(
  db: SupabaseClient,
  storeIdNum: number
): Promise<number> {
  const windowMins = await loadAcceptanceWindowMinutes(db, storeIdNum);

  const { data: rows, error } = await db
    .from('orders_core')
    .select('id, status, current_status, created_at')
    .eq('merchant_store_id', storeIdNum)
    .eq('status', 'assigned')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const coreIds = (rows ?? []).map((o) => Number((o as { id?: number }).id)).filter((id) => id > 0);
  const foodByCore = new Map<
    number,
    {
      order_status?: string | null;
      created_at?: string | null;
      merchant_acceptance_deadline_at?: string | null;
      merchant_acceptance_window_seconds?: number | null;
    }
  >();

  if (coreIds.length > 0) {
    const { data: foodRows } = await db
      .from('orders_food')
      .select(
        'order_id, order_status, created_at, merchant_acceptance_deadline_at, merchant_acceptance_window_seconds'
      )
      .eq('merchant_store_id', storeIdNum)
      .in('order_id', coreIds);
    for (const f of foodRows ?? []) {
      const coreId = Number((f as { order_id?: number }).order_id);
      if (coreId > 0) {
        foodByCore.set(
          coreId,
          f as {
            order_status?: string | null;
            created_at?: string | null;
            merchant_acceptance_deadline_at?: string | null;
            merchant_acceptance_window_seconds?: number | null;
          }
        );
      }
    }
  }

  let count = 0;
  const nowMs = Date.now();
  for (const o of rows ?? []) {
    const row = o as {
      id?: number;
      status?: string;
      current_status?: string | null;
      created_at?: string | null;
    };
    const coreId = Number(row.id ?? 0);
    const food = coreId > 0 ? foodByCore.get(coreId) : undefined;
    const pipeline = resolvePartnerPipeline(
      food?.order_status ?? null,
      row.status ?? 'assigned',
      row.current_status ?? null
    );
    if (pipeline !== 'CREATED') continue;

    if (
      !isWithinAcceptanceDeadline(
        {
          createdAtIso: food?.created_at ?? row.created_at ?? '',
          merchantAcceptanceDeadlineAt: food?.merchant_acceptance_deadline_at,
          merchantAcceptanceWindowSeconds: food?.merchant_acceptance_window_seconds,
        },
        windowMins,
        nowMs
      )
    ) {
      continue;
    }
    count += 1;
  }

  return count;
}
