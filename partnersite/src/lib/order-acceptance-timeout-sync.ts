import type { SupabaseClient } from '@supabase/supabase-js';
import { appendCancellationTimeline } from '@/lib/orderCancellationTimeline';
import { executeOrderCancellationFinancials, lookupOrderContext } from '@/lib/financial-rule-executor';
import { refundFieldsFromEngineResult } from '@gatimitra/financial-rules';
import { labelsForStatusUpdate, normalizeActionMode, normalizeActionSource } from '@/lib/merchantOrderFoodActions';
import { recordOrderCancellation } from '@/lib/record-order-cancellation';

export const AUTO_CANCEL_REASON = 'Auto Cancelled';

const UNACCEPTED_STATUSES = new Set(['CREATED', 'NEW', 'PLACED']);

function normFoodStatus(raw: string | null | undefined): string {
  const u = String(raw || 'CREATED').toUpperCase();
  return u === 'NEW' ? 'CREATED' : u;
}

export async function loadAcceptanceWindowMinutes(
  db: SupabaseClient,
  storeInternalId: number
): Promise<number> {
  const { data: storeRow } = await db
    .from('merchant_stores')
    .select('store_type')
    .eq('id', storeInternalId)
    .maybeSingle();
  const storeType = String(storeRow?.store_type ?? 'GENERAL').toUpperCase();

  const loadPlatform = async (stype: string) => {
    const { data } = await db
      .from('platform_food_acceptance_settings_by_store_type')
      .select('acceptance_window_minutes')
      .eq('store_type', stype)
      .maybeSingle();
    return data;
  };

  let row = await loadPlatform(storeType);
  if (!row) row = await loadPlatform('GENERAL');

  const windowRaw = Number(row?.acceptance_window_minutes ?? 5);
  return Number.isFinite(windowRaw)
    ? Math.max(1, Math.min(180, Math.floor(windowRaw)))
    : 5;
}

async function autoCancelOneFoodOrder(
  db: SupabaseClient,
  storeInternalId: number,
  foodRow: {
    id: number;
    order_id: number;
    order_status: string | null;
    accepted_at?: string | null;
    food_items_total_value?: number | null;
  }
): Promise<boolean> {
  const foodId = Number(foodRow.id);
  const coreId = Number(foodRow.order_id);
  if (!Number.isFinite(foodId) || !Number.isFinite(coreId)) return false;

  const currentStatus = normFoodStatus(foodRow.order_status);
  if (!UNACCEPTED_STATUSES.has(currentStatus)) return false;

  const actionSource = normalizeActionSource('system');
  const actionMode = normalizeActionMode('auto');
  const actionLabels = labelsForStatusUpdate({
    newStatus: 'CANCELLED',
    actionSource,
    actionMode,
    rejectedReason: AUTO_CANCEL_REASON,
  });

  const now = new Date().toISOString();
  const { data: updated, error } = await db
    .from('orders_food')
    .update({
      order_status: 'CANCELLED',
      cancelled_at: now,
      rejected_reason: AUTO_CANCEL_REASON,
      cancelled_by_label: actionLabels.cancelled_by_label ?? AUTO_CANCEL_REASON,
      cancelled_by_type: 'system',
      cancellation_details: {
        version: 1,
        source: 'system',
        action_source: 'system',
        cancel_mode: 'auto',
        rejected_reason: AUTO_CANCEL_REASON,
        cancelled_by_label: actionLabels.cancelled_by_label ?? AUTO_CANCEL_REASON,
      },
      updated_at: now,
    })
    .eq('id', foodId)
    .eq('merchant_store_id', storeInternalId)
    .is('cancelled_at', null)
    .select('id')
    .maybeSingle();

  if (error || !updated?.id) return false;

  try {
    await db
      .from('orders_core')
      .update({
        status: 'cancelled',
        current_status: 'CANCELLED',
        cancelled_at: now,
        cancelled_by: 'SYSTEM',
        updated_at: now,
      })
      .eq('id', coreId)
      .is('cancelled_at', null);
  } catch {
    /* ignore */
  }

  try {
    await appendCancellationTimeline(db, {
      orderCorePk: coreId,
      previousStatus: currentStatus,
      rejectedReason: AUTO_CANCEL_REASON,
      actorType: 'system',
      cancelMode: 'auto',
    });
  } catch {
    /* ignore */
  }

  try {
    const { data: coreMoney } = await db
      .from('orders_core')
      .select('grand_total, order_id')
      .eq('id', coreId)
      .maybeSingle();
    const orderCtx = await lookupOrderContext(coreId);
    const engineResult = await executeOrderCancellationFinancials({
      orderCoreId: coreId,
      ordersFoodId: foodId,
      coreOrderId: (coreMoney?.order_id as string | null) ?? orderCtx.coreOrderId,
      merchantStoreId: storeInternalId,
      previousStatus: currentStatus,
      cancelledByType: 'system',
      orderGross: Number(coreMoney?.grand_total ?? foodRow.food_items_total_value ?? orderCtx.grandTotal),
      serviceType: orderCtx.serviceType,
    });
    const refund = refundFieldsFromEngineResult(engineResult.raw);
    await recordOrderCancellation(db, {
      orderCorePk: coreId,
      cancelledBy: 'SYSTEM',
      displayReason: AUTO_CANCEL_REASON,
      cancelledByType: 'system',
      cancelledByLabel: actionLabels.cancelled_by_label ?? AUTO_CANCEL_REASON,
      actionSource: 'system',
      cancelMode: 'auto',
      previousStatus: currentStatus,
      acceptedAt: foodRow.accepted_at ?? null,
      grandTotal: coreMoney?.grand_total ?? 0,
      refundStatus: refund.refundStatus,
      refundAmount: refund.refundAmount,
      metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
    });
  } catch {
    /* ignore financial side-effects — row is already cancelled */
  }

  try {
    await db.from('merchant_order_food_actions').insert({
      orders_food_id: foodId,
      orders_core_id: coreId,
      merchant_store_id: storeInternalId,
      from_status: currentStatus,
      to_status: 'CANCELLED',
      action_source: 'system',
      actor_type: 'system',
      actor_label: actionLabels.actor_label,
      metadata: {
        rejected_reason: AUTO_CANCEL_REASON,
        cancel_mode: 'auto',
      },
    });
  } catch {
    /* ignore */
  }

  return true;
}

/** Cancel food orders past the acceptance window for one store (portal-open flush). */
export async function syncExpiredOrderAcceptanceForStore(
  db: SupabaseClient,
  storeInternalId: number
): Promise<{ cancelled: number }> {
  const windowMins = await loadAcceptanceWindowMinutes(db, storeInternalId);
  const cutoff = new Date(Date.now() - windowMins * 60_000).toISOString();

  const { data: rows, error } = await db
    .from('orders_food')
    .select('id, order_id, order_status, created_at, accepted_at, food_items_total_value')
    .eq('merchant_store_id', storeInternalId)
    .is('cancelled_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !rows?.length) {
    return { cancelled: 0 };
  }

  let cancelled = 0;
  for (const row of rows) {
    const st = normFoodStatus(row.order_status as string | null);
    if (!UNACCEPTED_STATUSES.has(st)) continue;
    const createdAt = String(row.created_at ?? '');
    if (!createdAt || isWithinAcceptanceWindow(createdAt, windowMins)) continue;
    const ok = await autoCancelOneFoodOrder(db, storeInternalId, {
      id: Number(row.id),
      order_id: Number(row.order_id),
      order_status: row.order_status as string | null,
      accepted_at: row.accepted_at as string | null,
      food_items_total_value: row.food_items_total_value as number | null,
    });
    if (ok) cancelled += 1;
  }

  return { cancelled };
}

export function isWithinAcceptanceWindow(
  createdAtIso: string,
  acceptanceWindowMinutes: number,
  nowMs = Date.now()
): boolean {
  const mins = Math.max(1, Math.min(180, acceptanceWindowMinutes));
  const deadline = new Date(createdAtIso).getTime() + mins * 60_000;
  return nowMs < deadline;
}
