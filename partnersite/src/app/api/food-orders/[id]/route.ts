import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import {
  labelsForStatusUpdate,
  normalizeActionMode,
  normalizeActionSource,
  computeOrderItemQuantityCount,
} from '@/lib/merchantOrderFoodActions';
import { appendAcceptanceTimeline } from '@/lib/orderAcceptanceTimeline';
import { appendCancellationTimeline } from '@/lib/orderCancellationTimeline';
import { appendDispatchedTimeline, appendReadyTimeline } from '@/lib/orderFoodStatusTimeline';
import { loadPartnerOrderItemsForFoodRow } from '@/lib/partnerFoodOrderItems';
import {
  PLATFORM_DEFAULT_PREP_MINUTES,
  resolveAcceptPrepCommitment,
  resolveStoreDefaultPrepMinutes,
} from '@/lib/order-prep-time';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
        'id, order_id, order_status, merchant_store_id, food_items_total_value, preparation_time_minutes, preparing_at, prep_ready_by_at'
      )
      .eq('id', orderIdNum)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (existing.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Order does not belong to this store' }, { status: 403 });
    }

    // orders_food.order_status can lag behind orders_core.current_status in unified pipeline.
    // Validate transitions using the same pipeline resolver used by partner UI.
    let currentStatus = normalizeOrderStatusForTransition(existing.order_status as string);
    try {
      const { data: core } = await db
        .from('orders_core')
        .select('status, current_status')
        .eq('id', existing.order_id as number)
        .maybeSingle();
      if (core) {
        const pipeline = resolvePartnerPipeline(
          existing.order_status as string | null,
          (core as any).status ?? 'assigned',
          (core as any).current_status ?? null
        );
        currentStatus = normalizeOrderStatusForTransition(pipeline);
      }
    } catch {
      /* ignore and fall back to orders_food.order_status */
    }
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({
        error: `Invalid transition from ${currentStatus} to ${newStatus}`,
      }, { status: 400 });
    }

    if (
      newStatus === 'ACCEPTED' &&
      (currentStatus === 'CREATED' || currentStatus === 'NEW')
    ) {
      const { data: storeGate } = await db
        .from('merchant_stores')
        .select('is_accepting_orders')
        .eq('id', storeInternalId)
        .maybeSingle();
      const { data: avail } = await db
        .from('merchant_store_availability')
        .select('is_accepting_orders')
        .eq('store_id', storeInternalId)
        .maybeSingle();
      const accepting =
        avail?.is_accepting_orders ?? storeGate?.is_accepting_orders ?? true;
      if (accepting === false) {
        return NextResponse.json(
          { error: 'Store is closed for new orders. Finish your active orders first.' },
          { status: 403 }
        );
      }
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

      const { data: storeRow } = await db
        .from('merchant_stores')
        .select('avg_preparation_time_minutes')
        .eq('id', storeInternalId)
        .maybeSingle();
      const storeDefault = resolveStoreDefaultPrepMinutes(
        storeRow?.avg_preparation_time_minutes ?? PLATFORM_DEFAULT_PREP_MINUTES
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
    }
    else if (newStatus === 'OUT_FOR_DELIVERY') {
      // Store can mark as dispatched from portal without OTP validation (OTP is for rider handover only).
      updates.dispatched_at = now;
    } else if (newStatus === 'DELIVERED') updates.delivered_at = now;
    else if (newStatus === 'CANCELLED') {
      updates.cancelled_at = now;
      if (rejectedReason) updates.rejected_reason = rejectedReason;
      if (actionLabels.cancelled_by_label) updates.cancelled_by_label = actionLabels.cancelled_by_label;
    } else if (newStatus === 'RTO') {
      updates.is_rto = true;
      updates.rto_at = now;
      try {
        await db.rpc('convert_food_order_otp_to_rto', { p_order_id: existing.order_id });
      } catch (e) {
        console.error('[RTO convert]', e);
      }
    }

    const { data, error } = await db
      .from('orders_food')
      .update(updates)
      .eq('id', orderIdNum)
      .eq('merchant_store_id', storeInternalId)
      .select()
      .single();

    if (error) {
      console.error('[food-orders PATCH] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const corePatch: Record<string, unknown> = { current_status: newStatus, updated_at: now };
      if (newStatus === 'ACCEPTED' && acceptPrepReadyByAt && acceptPrepMinutes != null) {
        corePatch.prep_ready_by_at = acceptPrepReadyByAt;
        corePatch.prep_time_minutes = acceptPrepMinutes;
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
        const backendBase = (
          process.env.GATIMITRA_BACKEND_API_URL ||
          process.env.BACKEND_API_URL ||
          ''
        ).replace(/\/+$/, '');
        if (orderIdText && backendBase) {
          await fetch(
            `${backendBase}/v1/eta/orders/${encodeURIComponent(orderIdText)}/recalc`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'MERCHANT_DELAY' }),
            }
          ).catch((err) => {
            console.warn('[food-orders PATCH] ETA recalc after accept failed:', err);
          });
        }
      } catch (etaErr) {
        console.warn('[food-orders PATCH] ETA recalc setup failed:', etaErr);
      }
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
          cancel_mode: newStatus === 'CANCELLED' ? actionMode : undefined,
        },
      });
    } catch (logErr) {
      console.warn('[food-orders PATCH] action log failed (run migration 0146?):', logErr);
    }

    // When order transitions to DELIVERED, credit merchant wallet (ORDER_EARNING) so dashboard/payments show correct earnings
    const didJustDeliver = newStatus === 'DELIVERED' && currentStatus !== 'DELIVERED';
    if (didJustDeliver) {
      const amount = Number(existing.food_items_total_value ?? 0);
      if (amount > 0) {
        try {
          const { data: walletId, error: rpcWalletErr } = await db.rpc('get_or_create_merchant_wallet', {
            p_merchant_store_id: existing.merchant_store_id,
          });
          if (rpcWalletErr || walletId == null) {
            console.error('[food-orders PATCH] get_or_create_merchant_wallet:', rpcWalletErr);
          } else {
            const idempotencyKey = `order_earning_${orderIdNum}`;
            const { error: creditErr } = await db.rpc('merchant_wallet_credit', {
              p_wallet_id: walletId,
              p_amount: amount,
              p_category: 'ORDER_EARNING',
              p_balance_type: 'AVAILABLE',
              p_reference_type: 'ORDER',
              p_reference_id: orderIdNum,
              p_idempotency_key: idempotencyKey,
              p_description: `Order #${existing.order_id} delivered`,
              p_metadata: {},
            });
            if (creditErr) {
              console.error('[food-orders PATCH] merchant_wallet_credit:', creditErr);
            }
          }
        } catch (e) {
          console.error('[food-orders PATCH] wallet credit failed:', e);
        }
      }
    }

    const enrichedItems = await loadPartnerOrderItemsForFoodRow(db, data as Record<string, unknown>);
    const itemCount = computeOrderItemQuantityCount({
      items: enrichedItems,
      food_items_count: (data as { food_items_count?: number | null }).food_items_count,
    });

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
