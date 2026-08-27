import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  appendDispatchedTimeline,
  appendHandoverTimeline,
} from '@/lib/orderFoodStatusTimeline';
import { isSelfPickupDeliveryType } from '@/lib/partner-delivery-type';
import { creditMerchantOrderEarningOnDelivered } from '@/lib/credit-merchant-order-on-delivered';
import { resolveMerchantWalletCreditAmount } from '@/lib/merchant-order-ctm';
import { loadPartnerOrderItemsForFoodRow } from '@/lib/partnerFoodOrderItems';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import {
  clearStoreOrderNotifications,
  shouldClearOrderNotifications,
} from '@/lib/clear-store-order-notifications';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(
  db: ReturnType<typeof getSupabase>,
  storeIdParam: string
): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

async function applyFoodStatus(
  db: ReturnType<typeof getSupabase>,
  opts: {
    foodId: number;
    orderCoreId: number;
    storeInternalId: number;
    fromStatus: string;
    toStatus: 'OUT_FOR_DELIVERY' | 'DELIVERED';
    now: string;
  }
) {
  const { foodId, orderCoreId, storeInternalId, fromStatus, toStatus, now } = opts;
  const updates: Record<string, unknown> = {
    order_status: toStatus,
    updated_at: now,
  };
  if (toStatus === 'OUT_FOR_DELIVERY') updates.dispatched_at = now;
  if (toStatus === 'DELIVERED') updates.delivered_at = now;

  const { data, error } = await db
    .from('orders_food')
    .update(updates)
    .eq('id', foodId)
    .eq('merchant_store_id', storeInternalId)
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message || `Failed to set ${toStatus}`);
  }

  await db
    .from('orders_core')
    .update({ current_status: toStatus, updated_at: now })
    .eq('id', orderCoreId);

  if (toStatus === 'OUT_FOR_DELIVERY') {
    try {
      await appendDispatchedTimeline(db, {
        orderCorePk: orderCoreId,
        previousStatus: fromStatus,
        actionSource: 'website',
        dispatchedAt: now,
        actorName: 'Store (self-pickup)',
      });
    } catch (tlErr) {
      console.warn('[complete-self-pickup] dispatched timeline failed:', tlErr);
    }
  }

  try {
    await db.from('merchant_order_food_actions').insert({
      orders_food_id: foodId,
      orders_core_id: orderCoreId,
      merchant_store_id: storeInternalId,
      from_status: fromStatus,
      to_status: toStatus,
      action_source: 'website',
      actor_type: 'merchant',
      actor_label: 'Store (self-pickup OTP)',
      metadata: { self_pickup_otp_complete: true },
    });
  } catch (logErr) {
    console.warn('[complete-self-pickup] action log failed:', logErr);
  }

  const walletAmount = await resolveMerchantWalletCreditAmount(db, {
    ordersCoreId: orderCoreId,
    ordersFoodId: foodId,
    storeId: storeInternalId,
  });

  await creditMerchantOrderEarningOnDelivered(db, {
    merchantStoreId: storeInternalId,
    ordersFoodId: foodId,
    ordersCoreId: orderCoreId,
    amount: walletAmount,
    newStatus: toStatus,
    previousStatus: fromStatus,
  });

  if (shouldClearOrderNotifications(toStatus)) {
    try {
      await clearStoreOrderNotifications(db, {
        storeId: storeInternalId,
        ordersFoodId: foodId,
        orderCoreId,
        formattedOrderId:
          (data as { formatted_order_id?: string | null }).formatted_order_id ?? null,
      });
    } catch (clearErr) {
      console.warn('[complete-self-pickup] clear notifications failed:', clearErr);
    }
  }

  return data;
}

/**
 * POST /api/food-orders/[id]/complete-self-pickup
 * Body: { store_id, otp }
 *
 * Store collects customer Pickup OTP, then completes:
 * READY_FOR_PICKUP → OUT_FOR_DELIVERY (picked up) → DELIVERED.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const storeId = String(body.store_id || '').trim();
    const inputOtp = String(body.otp || '').trim();
    if (!storeId || !inputOtp) {
      return NextResponse.json({ error: 'store_id and otp required' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const foodId = parseInt(id, 10);
    if (isNaN(foodId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const { data: food, error: fe } = await db
      .from('orders_food')
      .select('id, order_id, merchant_store_id, order_status, formatted_order_id')
      .eq('id', foodId)
      .single();
    if (fe || !food || food.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // delivery_type is on orders_core only (not orders_food).
    const { data: core } = await db
      .from('orders_core')
      .select('delivery_type, billing_snapshot')
      .eq('id', food.order_id as number)
      .maybeSingle();
    let deliveryType = String(core?.delivery_type ?? '').toUpperCase();
    const snap = core?.billing_snapshot as {
      isSelfPickup?: boolean;
      delivery_type?: string;
    } | null;
    if (
      !isSelfPickupDeliveryType(deliveryType) &&
      snap?.isSelfPickup !== true &&
      !isSelfPickupDeliveryType(snap?.delivery_type)
    ) {
      return NextResponse.json(
        { error: 'Only self-pickup orders can be completed with customer OTP' },
        { status: 400 }
      );
    }

    let status = String(food.order_status || '')
      .toUpperCase()
      .replace('NEW', 'CREATED');
    if (status !== 'READY_FOR_PICKUP' && status !== 'OUT_FOR_DELIVERY') {
      return NextResponse.json(
        { error: `Order must be Ready or Picked up (current: ${status})` },
        { status: 400 }
      );
    }

    const orderCoreId = food.order_id as number;
    const { data: otpRow, error: oe } = await db
      .from('order_food_otps')
      .select('id, otp_code, otp_type, verified_at, attempt_count, locked_until')
      .eq('order_id', orderCoreId)
      .eq('otp_type', 'PICKUP')
      .maybeSingle();
    if (oe || !otpRow) {
      return NextResponse.json({ error: 'Pickup OTP not found' }, { status: 404 });
    }

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const alreadyVerified = !!otpRow.verified_at;

    if (!alreadyVerified) {
      if (otpRow.locked_until && new Date(otpRow.locked_until) > nowDate) {
        return NextResponse.json(
          { valid: false, error: 'Too many attempts. Try again later.' },
          { status: 429 }
        );
      }
      if (otpRow.otp_code !== inputOtp) {
        const newAttempts = (otpRow.attempt_count || 0) + 1;
        const lockUntil =
          newAttempts >= MAX_ATTEMPTS
            ? new Date(nowDate.getTime() + LOCK_MINUTES * 60 * 1000)
            : null;
        await db
          .from('order_food_otps')
          .update({
            attempt_count: newAttempts,
            locked_until: lockUntil?.toISOString() ?? null,
            updated_at: now,
          })
          .eq('id', otpRow.id);
        await db.from('order_food_otp_audit').insert({
          order_id: orderCoreId,
          action: 'VALIDATE_FAIL',
          otp_type: 'PICKUP',
        });
        return NextResponse.json(
          {
            valid: false,
            error: 'Invalid OTP',
            attempts_remaining: Math.max(0, MAX_ATTEMPTS - newAttempts),
          },
          { status: 400 }
        );
      }

      await db
        .from('order_food_otps')
        .update({
          verified_at: now,
          verified_by: 'merchant',
          attempt_count: 0,
          locked_until: null,
          updated_at: now,
        })
        .eq('id', otpRow.id);
      await db.from('order_food_otp_audit').insert({
        order_id: orderCoreId,
        action: 'VALIDATE_SUCCESS',
        otp_type: 'PICKUP',
      });

      await db
        .from('orders_food')
        .update({ handed_over_to_rider_at: now, updated_at: now })
        .eq('id', foodId)
        .is('handed_over_to_rider_at', null);
      await db
        .from('orders_core')
        .update({ handed_over_to_rider_at: now, updated_at: now })
        .eq('id', orderCoreId)
        .is('handed_over_to_rider_at', null);

      try {
        await appendHandoverTimeline(db, {
          orderCorePk: orderCoreId,
          handedOverAt: now,
          verifiedBy: 'merchant',
        });
      } catch (tlErr) {
        console.warn('[complete-self-pickup] handover timeline failed:', tlErr);
      }
    } else if (otpRow.otp_code !== inputOtp) {
      return NextResponse.json({ valid: false, error: 'Invalid OTP' }, { status: 400 });
    }

    let lastRow = food as Record<string, unknown>;
    if (status === 'READY_FOR_PICKUP') {
      lastRow = await applyFoodStatus(db, {
        foodId,
        orderCoreId,
        storeInternalId,
        fromStatus: status,
        toStatus: 'OUT_FOR_DELIVERY',
        now,
      });
      status = 'OUT_FOR_DELIVERY';
    }

    if (status === 'OUT_FOR_DELIVERY') {
      lastRow = await applyFoodStatus(db, {
        foodId,
        orderCoreId,
        storeInternalId,
        fromStatus: status,
        toStatus: 'DELIVERED',
        now,
      });
    }

    const enrichedItems = await loadPartnerOrderItemsForFoodRow(db, lastRow);
    const itemCount = computeOrderItemQuantityCount({
      items: enrichedItems,
      food_items_count: (lastRow as { food_items_count?: number | null }).food_items_count,
    });

    return NextResponse.json({
      valid: true,
      completed: true,
      order: {
        ...lastRow,
        order_status: 'DELIVERED',
        items: enrichedItems,
        food_items_count: itemCount,
        display_item_count: itemCount,
      },
    });
  } catch (err) {
    console.error('[food-orders complete-self-pickup]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
