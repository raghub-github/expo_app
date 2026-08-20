import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  labelsForStatusUpdate,
  normalizeActionMode,
  normalizeActionSource,
  computeOrderItemQuantityCount,
  orderAcceptanceSourceFromAction,
} from '@/lib/merchantOrderFoodActions';
import { appendAcceptanceTimeline } from '@/lib/orderAcceptanceTimeline';
import { appendCancellationTimeline } from '@/lib/orderCancellationTimeline';
import {
  actorTypeFromSource,
  recordOrderCancellation,
} from '@/lib/record-order-cancellation';
import { refundFieldsFromEngineResult } from '@gatimitra/financial-rules';
import { triggerOrderAutoRefund } from '@/lib/triggerOrderAutoRefund';
import {
  executeOrderCancellationFinancials,
  executeRtoFinancials,
  lookupOrderContext,
} from '@/lib/financial-rule-executor';
import { creditMerchantOrderEarningOnDelivered } from '@/lib/credit-merchant-order-on-delivered';
import {
  persistMerchantCtmAtAccept,
  resolveMerchantWalletCreditAmount,
} from '@/lib/merchant-order-ctm';
import { appendDispatchedTimeline, appendReadyTimeline } from '@/lib/orderFoodStatusTimeline';
import { loadPartnerOrderItemsForFoodRow } from '@/lib/partnerFoodOrderItems';
import {
  clearStoreOrderNotifications,
  shouldClearOrderNotifications,
} from '@/lib/clear-store-order-notifications';
import {
  PLATFORM_DEFAULT_PREP_MINUTES,
  resolveAcceptPrepCommitment,
  resolveStorePrepWithBuffer,
  computePreparedLateMinutes,
} from '@/lib/order-prep-time';
import { triggerOrderEtaRecalcAfterAccept } from '@/lib/trigger-order-eta-recalc';
import { broadcastMerchantIncomingResolved } from '@/lib/merchant-incoming-resolved-broadcast';
import { notifyCustomerMerchantAccepted } from '@/lib/notify-customer-merchant-accepted';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/** Align with orders_core.current_status / emit_order_event (PLACED = just placed, same as new for merchant). */
function normalizeOrderStatusForTransition(raw: string | null | undefined): string {
  let s = String(raw || 'CREATED').toUpperCase().replace('NEW', 'CREATED');
  if (s === 'PLACED' || s === 'ORDER_RECEIVED' || s === 'ORDER_PLACED') s = 'CREATED';
  return s;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['ACCEPTED', 'CANCELLED'],
  NEW: ['ACCEPTED', 'CANCELLED'], // backward compat
  ACCEPTED: ['PREPARING', 'READY_FOR_PICKUP', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED', 'RTO'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED', 'RTO'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RTO'],
  DELIVERED: [],
  CANCELLED: [],
  RTO: [],
};

/**
 * PATCH /api/food-orders/[id]
 * Body: { store_id: string, status: string, rejected_reason?: string }
 * Updates order status with proper timestamps.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const storeId = body.store_id;
    const newStatus = (body.status || '').toUpperCase();
    const rejectedReason = body.rejected_reason || null;
    const actionSource = normalizeActionSource(body.action_source);
    const actionMode = normalizeActionMode(body.accept_mode ?? body.cancel_mode);
    const actionLabels = labelsForStatusUpdate({
      newStatus,
      actionSource,
      actionMode,
      rejectedReason,
    });

    if (!storeId || !newStatus) {
      return NextResponse.json({ error: 'store_id and status are required' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const orderIdNum = parseInt(id, 10);
    if (isNaN(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await db
      .from('orders_food')
      .select(
        'id, order_id, order_status, merchant_store_id, food_items_total_value, preparation_time_minutes, preparing_at, prep_ready_by_at, accepted_at'
      )
      .eq('id', orderIdNum)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (existing.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Order does not belong to this store' }, { status: 403 });
    }

    const rawFoodStatus = normalizeOrderStatusForTransition(existing.order_status as string);

    // Idempotent — merchant UI may re-send the same status (e.g. Mark Ready while already ready).
    if (newStatus === rawFoodStatus) {
      const enrichedItems = await loadPartnerOrderItemsForFoodRow(
        db,
        existing as Record<string, unknown>
      );
      const itemCount = computeOrderItemQuantityCount({
        items: enrichedItems,
        food_items_count: (existing as { food_items_count?: number | null }).food_items_count,
      });
      return NextResponse.json({
        order: {
          ...existing,
          order_status: rawFoodStatus,
          items: enrichedItems,
          food_items_count: itemCount,
          display_item_count: itemCount,
        },
        idempotent: true,
      });
    }

    // Validate against orders_food.order_status — orders_core.current_status can run ahead
    // (ETA/rider) while the food row still needs merchant PREPARING → READY_FOR_PICKUP.
    const currentStatus = rawFoodStatus;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `Invalid transition from ${currentStatus} to ${newStatus}`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      order_status: newStatus,
      updated_at: now,
    };

    let acceptPrepReadyByAt: string | null = null;
    let acceptPrepMinutes: number | null = null;

    if (newStatus === 'ACCEPTED') {
      updates.accepted_at = now;
      if (actionLabels.accepted_by_label) updates.accepted_by_label = actionLabels.accepted_by_label;
      const acceptanceSource = orderAcceptanceSourceFromAction(actionSource);
      if (acceptanceSource) updates.acceptance_source = acceptanceSource;

      const [{ data: storeRow }, { data: settingsRow }] = await Promise.all([
        db
          .from('merchant_stores')
          .select('avg_preparation_time_minutes')
          .eq('id', storeInternalId)
          .maybeSingle(),
        db
          .from('merchant_store_settings')
          .select('preparation_buffer_minutes')
          .eq('store_id', storeInternalId)
          .maybeSingle(),
      ]);
      const storeDefault = resolveStorePrepWithBuffer(
        storeRow?.avg_preparation_time_minutes ?? PLATFORM_DEFAULT_PREP_MINUTES,
        settingsRow?.preparation_buffer_minutes ?? 0
      );
      const prep = resolveAcceptPrepCommitment({
        acceptedAtIso: now,
        storeDefaultMinutes: storeDefault,
        bodyPrepMinutes: body.preparation_time_minutes,
        existingOrderPrepMinutes: existing.preparation_time_minutes,
      });
      acceptPrepReadyByAt = prep.prepReadyByAt;
      acceptPrepMinutes = prep.prepMinutes;
      updates.preparation_time_minutes = prep.prepMinutes;
      updates.prep_ready_by_at = prep.prepReadyByAt;
      updates.prep_time_source = prep.prepTimeSource;
    }
    else if (newStatus === 'PREPARING') {
      updates.preparing_at = now;
      updates.prepared_at = null;
    }
    else if (newStatus === 'READY_FOR_PICKUP') {
      updates.prepared_at = now;
      if (!existing.preparing_at) updates.preparing_at = now;
      updates.prepared_late_minutes = computePreparedLateMinutes(
        now,
        (existing.prep_ready_by_at as string | null) ?? null
      );
    }
    else if (newStatus === 'OUT_FOR_DELIVERY') {
      // Store can mark as dispatched from portal without OTP validation (OTP is for rider handover only).
      updates.dispatched_at = now;
    } else if (newStatus === 'DELIVERED') updates.delivered_at = now;
    else if (newStatus === 'CANCELLED') {
      updates.cancelled_at = now;
      if (rejectedReason) updates.rejected_reason = rejectedReason;
      if (actionLabels.cancelled_by_label) updates.cancelled_by_label = actionLabels.cancelled_by_label;
      updates.cancelled_by_type = actorTypeFromSource(actionSource);
      updates.cancellation_details = {
        version: 1,
        source: actorTypeFromSource(actionSource),
        cancelled_by_label: actionLabels.cancelled_by_label,
        rejected_reason: rejectedReason,
        action_source: actionSource,
        cancel_mode: actionMode,
      };
    } else if (newStatus === 'RTO') {
      updates.is_rto = true;
      updates.rto_at = now;
      try {
        await db.rpc('convert_food_order_otp_to_rto', { p_order_id: existing.order_id });
      } catch (e) {
        console.error('[RTO convert]', e);
      }
    }

    let { data, error } = await db
      .from('orders_food')
      .update(updates)
      .eq('id', orderIdNum)
      .eq('merchant_store_id', storeInternalId)
      .select()
      .single();

    if (error && String(error.message || '').toLowerCase().includes('acceptance_source')) {
      const withoutSource = { ...updates };
      delete withoutSource.acceptance_source;
      const retry = await db
        .from('orders_food')
        .update(withoutSource)
        .eq('id', orderIdNum)
        .eq('merchant_store_id', storeInternalId)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[food-orders PATCH] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const corePatch: Record<string, unknown> = { current_status: newStatus, updated_at: now };
      if (newStatus === 'CANCELLED') {
        corePatch.status = 'cancelled';
        corePatch.cancelled_at = now;
        corePatch.cancelled_by = 'SYSTEM';
      }
      if (newStatus === 'ACCEPTED' && acceptPrepReadyByAt && acceptPrepMinutes != null) {
        corePatch.prep_ready_by_at = acceptPrepReadyByAt;
        corePatch.prep_time_minutes = acceptPrepMinutes;
        corePatch.expected_ready_at = acceptPrepReadyByAt;
      }
      if (newStatus === 'READY_FOR_PICKUP' && updates.prepared_late_minutes != null) {
        corePatch.prepared_late_minutes = updates.prepared_late_minutes;
      }
      await db
        .from('orders_core')
        .update(corePatch)
        .eq('id', existing.order_id as number);
    } catch (coreErr) {
      console.warn('[food-orders PATCH] orders_core sync failed:', coreErr);
    }

    if (newStatus === 'ACCEPTED') {
      try {
        await appendAcceptanceTimeline(db, {
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          actionSource,
          acceptMode: actionMode,
          acceptedByLabel: actionLabels.accepted_by_label,
          expectedByAt: acceptPrepReadyByAt,
        });
      } catch (tlErr) {
        console.warn('[food-orders PATCH] acceptance timeline failed:', tlErr);
      }

      // Refresh customer live ETA using merchant-committed prep minutes on orders_core.
      try {
        const { data: coreMeta } = await db
          .from('orders_core')
          .select('order_id')
          .eq('id', existing.order_id as number)
          .maybeSingle();
        const orderIdText = (coreMeta?.order_id as string | null)?.trim();
        if (orderIdText) {
          const ok = await triggerOrderEtaRecalcAfterAccept(orderIdText, 'STATUS_CHANGE');
          if (!ok) {
            console.warn('[food-orders PATCH] ETA recalc after accept skipped or failed for', orderIdText);
          }
        }
      } catch (etaErr) {
        console.warn('[food-orders PATCH] ETA recalc setup failed:', etaErr);
      }

      try {
        await persistMerchantCtmAtAccept(db, {
          ordersCoreId: existing.order_id as number,
          ordersFoodId: orderIdNum,
          storeId: storeInternalId,
        });
      } catch (ctmErr) {
        console.warn('[food-orders PATCH] merchant CTM freeze failed:', ctmErr);
      }

      // Backend-driven customer push: Order Confirmed by the Store
      void notifyCustomerMerchantAccepted({
        ordersCoreId: existing.order_id as number,
        fromStatus: currentStatus,
        storeName: null,
      });
    }

    if (newStatus === 'CANCELLED') {
      try {
        await appendCancellationTimeline(db, {
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          rejectedReason: rejectedReason ?? null,
          actorType: actionSource === 'admin' ? 'admin' : actionSource === 'system' ? 'system' : 'store',
          cancelMode: actionMode,
        });
      } catch (tlErr) {
        console.warn('[food-orders PATCH] cancellation timeline failed:', tlErr);
      }
      const displayReason = (rejectedReason ?? '').trim() || 'Order cancelled';
      const { data: coreMoney } = await db
        .from('orders_core')
        .select('grand_total, order_id')
        .eq('id', existing.order_id as number)
        .maybeSingle();
      const cancelledByType = actorTypeFromSource(actionSource);
      const orderCtx = await lookupOrderContext(existing.order_id as number);
      const engineResult = await executeOrderCancellationFinancials({
        orderCoreId: existing.order_id as number,
        ordersFoodId: orderIdNum,
        coreOrderId: (coreMoney?.order_id as string | null) ?? orderCtx.coreOrderId,
        merchantStoreId: existing.merchant_store_id as number,
        previousStatus: currentStatus,
        cancelledByType,
        orderGross: Number(coreMoney?.grand_total ?? existing.food_items_total_value ?? orderCtx.grandTotal),
        serviceType: orderCtx.serviceType,
      });
      const refund = refundFieldsFromEngineResult(engineResult.raw);
      try {
        await recordOrderCancellation(db, {
          orderCorePk: existing.order_id as number,
          cancelledBy: 'merchant',
          displayReason,
          cancelledByType,
          cancelledByLabel:
            actionLabels.cancelled_by_label ?? 'Cancelled',
          actionSource,
          cancelMode: actionMode,
          previousStatus: currentStatus,
          acceptedAt: (existing.accepted_at as string | null) ?? null,
          grandTotal: coreMoney?.grand_total ?? 0,
          refundStatus: refund.refundStatus,
          refundAmount: refund.refundAmount,
          metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
        });
      } catch (cancelRowErr) {
        console.warn('[food-orders PATCH] order_cancellation_reasons failed:', cancelRowErr);
      }

      // Actually MOVE the money. recordOrderCancellation above only stamps refund
      // INTENT, which left the customer at PENDING forever on a merchant reject.
      // Any non-customer cancel (store / system / rider) refunds in full — they
      // paid and got nothing; fault only decides who gets debited (rule engine).
      // Awaited so the refund is attempted before we respond; the helper swallows
      // its own errors so a refund failure can never fail the cancellation.
      await triggerOrderAutoRefund({
        orderCorePk: existing.order_id as number,
        reason: displayReason,
        actorRole: cancelledByType,
      });
    }

    if (newStatus === 'RTO') {
      try {
        const orderCtx = await lookupOrderContext(existing.order_id as number);
        await executeRtoFinancials({
          orderCoreId: existing.order_id as number,
          ordersFoodId: orderIdNum,
          coreOrderId: orderCtx.coreOrderId,
          previousStatus: currentStatus,
          triggeredByType: actorTypeFromSource(actionSource),
          orderGross: orderCtx.grandTotal,
        });
      } catch (rtoErr) {
        console.warn('[food-orders PATCH] RTO financial rule:', rtoErr);
      }
    }

    if (newStatus === 'READY_FOR_PICKUP') {
      try {
        await appendReadyTimeline(db, {
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          actionSource,
          preparedAt: (updates.prepared_at as string) ?? now,
          prepReadyByAt: (existing as { prep_ready_by_at?: string | null }).prep_ready_by_at ?? null,
        });
      } catch (tlErr) {
        console.warn('[food-orders PATCH] ready timeline failed:', tlErr);
      }
    }

    if (newStatus === 'OUT_FOR_DELIVERY') {
      try {
        await appendDispatchedTimeline(db, {
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          actionSource,
          dispatchedAt: (updates.dispatched_at as string) ?? now,
          actorName: actionLabels.actor_label,
        });
      } catch (tlErr) {
        console.warn('[food-orders PATCH] dispatched timeline failed:', tlErr);
      }
    }

    try {
      await db.from('merchant_order_food_actions').insert({
        orders_food_id: orderIdNum,
        orders_core_id: existing.order_id as number,
        merchant_store_id: storeInternalId,
        from_status: currentStatus,
        to_status: newStatus,
        action_source: actionSource,
        actor_type: 'merchant',
        actor_label: actionLabels.actor_label,
        metadata: {
          ...(rejectedReason ? { rejected_reason: rejectedReason } : {}),
          accept_mode: newStatus === 'ACCEPTED' ? actionMode : undefined,
          ...(newStatus === 'ACCEPTED'
            ? { acceptance_source: orderAcceptanceSourceFromAction(actionSource) }
            : {}),
          cancel_mode: newStatus === 'CANCELLED' ? actionMode : undefined,
        },
      });
    } catch (logErr) {
      console.warn('[food-orders PATCH] action log failed (run migration 0146?):', logErr);
    }

    const walletAmount = await resolveMerchantWalletCreditAmount(db, {
      ordersCoreId: existing.order_id as number,
      ordersFoodId: orderIdNum,
      storeId: storeInternalId,
    });

    await creditMerchantOrderEarningOnDelivered(db, {
      merchantStoreId: existing.merchant_store_id as number,
      ordersFoodId: orderIdNum,
      ordersCoreId: existing.order_id as number,
      amount: walletAmount,
      newStatus,
      previousStatus: currentStatus,
    });

    if (shouldClearOrderNotifications(newStatus)) {
      try {
        await clearStoreOrderNotifications(db, {
          storeId: storeInternalId,
          ordersFoodId: orderIdNum,
          orderCoreId: existing.order_id as number,
          formattedOrderId:
            (data as { formatted_order_id?: string | null }).formatted_order_id ??
            (existing as { formatted_order_id?: string | null }).formatted_order_id ??
            null,
        });
      } catch (clearErr) {
        console.warn('[food-orders PATCH] clear order notifications failed:', clearErr);
      }
    }

    const enrichedItems = await loadPartnerOrderItemsForFoodRow(db, data as Record<string, unknown>);
    const itemCount = computeOrderItemQuantityCount({
      items: enrichedItems,
      food_items_count: (data as { food_items_count?: number | null }).food_items_count,
    });

    if (newStatus === 'ACCEPTED' || newStatus === 'CANCELLED') {
      void broadcastMerchantIncomingResolved({
        storeId: storeInternalId,
        coreId: Number(existing.order_id) || null,
        foodId: orderIdNum,
        status: newStatus,
      });
    }

    return NextResponse.json({
      order: {
        ...data,
        order_status: newStatus,
        items: enrichedItems,
        food_items_count: itemCount,
        display_item_count: itemCount,
      },
    });
  } catch (err) {
    console.error('[food-orders PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
