import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  extractItemsArray,
  mapCoreDbItemsToRaw,
  normalizeOrderItems,
} from '@/lib/orderLineItems';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/order-details?orderId=123&storeId=GMMC1015
 * Returns order items and rider for ledger expand. Uses orders_food (order_id = orders_core.id) for food orders.
 * Falls back to order_items / order_rider_assignments if present (unified schema with orders.id).
 */
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');
    const storeId = req.nextUrl.searchParams.get('storeId');
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid orderId' }, { status: 400 });
    }

    const db = getDb();

    // Resolve store for validation and for orders_food lookup
    let storeInternalId: number | null = null;
    if (storeId?.trim()) {
      const { data: store } = await db.from('merchant_stores').select('id').eq('store_id', storeId.trim()).single();
      if (store) storeInternalId = store.id as number;
    }

    // 1) Prefer orders_food (food orders: order_id = orders_core.id) for items + rider
    const { data: food } = await db
      .from('orders_food')
      .select('id, order_id, merchant_store_id, items, rider_id, rider_name, rider_phone, dispatched_at, delivered_at')
      .eq('order_id', orderIdNum)
      .maybeSingle();

    if (food) {
      if (storeInternalId != null && (food.merchant_store_id as number) !== storeInternalId) {
        return NextResponse.json({ error: 'Order not found for this store' }, { status: 404 });
      }

      let rawItems: unknown = food.items;
      if (extractItemsArray(rawItems).length === 0) {
        const { data: coreRow } = await db
          .from('orders_core')
          .select('order_id, items')
          .eq('id', orderIdNum)
          .maybeSingle();
        if (coreRow?.items && extractItemsArray(coreRow.items).length > 0) {
          rawItems = coreRow.items;
        } else {
          const textOrderId = String(coreRow?.order_id ?? '').trim();
          if (textOrderId) {
            const { data: coreItemRows } = await db
              .from('orders_core_items')
              .select('id, order_id, item_name, variant_name, quantity, base_price, total_price, veg_nonveg')
              .eq('order_id', textOrderId)
              .order('id');
            if (coreItemRows && coreItemRows.length > 0) {
              const itemIds = coreItemRows.map((r) => Number((r as { id: number }).id)).filter(Number.isFinite);
              const addonsByItemId = new Map<number, { order_item_id: number; addon_name?: string | null; quantity: number }[]>();
              if (itemIds.length > 0) {
                const { data: addonRows } = await db
                  .from('orders_core_item_addons')
                  .select('order_item_id, addon_name, quantity, addon_price')
                  .in('order_item_id', itemIds);
                for (const a of addonRows || []) {
                  const itemId = Number((a as { order_item_id: number }).order_item_id);
                  if (!Number.isFinite(itemId)) continue;
                  const list = addonsByItemId.get(itemId) ?? [];
                  list.push(a as { order_item_id: number; addon_name?: string | null; quantity: number });
                  addonsByItemId.set(itemId, list);
                }
              }
              rawItems = mapCoreDbItemsToRaw(
                coreItemRows as Parameters<typeof mapCoreDbItemsToRaw>[0],
                addonsByItemId
              );
            }
          }
        }
      }

      const normalized = normalizeOrderItems(rawItems);
      const items = normalized.map((it, idx) => ({
        id: idx + 1,
        item_name: it.name,
        item_title: it.name || null,
        quantity: it.quantity,
        unit_price: it.price,
        total_price: it.total,
        item_type: it.vegNonveg ?? null,
        customizations: it.customizations,
      }));

      const riders: { id: number; rider_id: number; rider_name: string | null; rider_mobile: string | null; assignment_status: string; assigned_at: string | null; accepted_at: string | null; rejected_at: string | null; reached_merchant_at: string | null; picked_up_at: string | null; delivered_at: string | null; cancelled_at: string | null }[] = [];
      if (food.rider_id != null || food.rider_name != null || food.rider_phone != null) {
        riders.push({
          id: (food.rider_id as number) ?? 0,
          rider_id: (food.rider_id as number) ?? 0,
          rider_name: (food.rider_name as string) ?? null,
          rider_mobile: (food.rider_phone as string) ?? null,
          assignment_status: food.delivered_at ? 'completed' : 'assigned',
          assigned_at: null,
          accepted_at: null,
          rejected_at: null,
          reached_merchant_at: null,
          picked_up_at: food.dispatched_at as string | null ?? null,
          delivered_at: food.delivered_at as string | null ?? null,
          cancelled_at: null,
        });
      }

      return NextResponse.json({ success: true, items, riders });
    }

    // 2) Fallback: order_items + order_rider_assignments (unified schema, order_id = orders.id)
    if (storeInternalId != null) {
      const { data: ord } = await db.from('orders').select('merchant_store_id').eq('id', orderIdNum).single();
      if (ord && (ord.merchant_store_id as number) !== storeInternalId) {
        return NextResponse.json({ error: 'Order not found for this store' }, { status: 404 });
      }
    }

    const [itemsRes, ridersRes] = await Promise.all([
      db.from('order_items').select('id, item_name, item_title, quantity, unit_price, total_price, item_type').eq('order_id', orderIdNum).order('id'),
      db.from('order_rider_assignments').select('id, rider_id, rider_name, rider_mobile, assignment_status, assigned_at, accepted_at, rejected_at, reached_merchant_at, picked_up_at, delivered_at, cancelled_at').eq('order_id', orderIdNum).order('assigned_at', { ascending: false }),
    ]);

    const items = (itemsRes.data || []).map((r: { id: number; item_name: string; item_title: string | null; quantity: number; unit_price: number; total_price: number; item_type: string | null }) => ({
      id: r.id,
      item_name: r.item_name,
      item_title: r.item_title,
      quantity: r.quantity,
      unit_price: Number(r.unit_price),
      total_price: Number(r.total_price),
      item_type: r.item_type,
    }));

    const riders = (ridersRes.data || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      rider_id: r.rider_id,
      rider_name: r.rider_name,
      rider_mobile: r.rider_mobile,
      assignment_status: r.assignment_status,
      assigned_at: r.assigned_at,
      accepted_at: r.accepted_at,
      rejected_at: r.rejected_at,
      reached_merchant_at: r.reached_merchant_at,
      picked_up_at: r.picked_up_at,
      delivered_at: r.delivered_at,
      cancelled_at: r.cancelled_at,
    }));

    return NextResponse.json({ success: true, items, riders });
  } catch (e) {
    console.error('[merchant/order-details]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
