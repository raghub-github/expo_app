import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve public store_id to internal bigint id */
async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<{ id: number } | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id, store_name')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return { id: data.id as number };
}

function extractItemsArray(rawItems: unknown): unknown[] {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>;
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.order_items)) return o.order_items;
        if (Array.isArray(o.cart_items)) return o.cart_items;
      }
    } catch {
      return [];
    }
  }
  if (rawItems && typeof rawItems === 'object') {
    const o = rawItems as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.order_items)) return o.order_items;
    if (Array.isArray(o.cart_items)) return o.cart_items;
  }
  return [];
}

function normalizeOrderItems(
  rawItems: unknown
): Array<{ name: string; quantity: number; price: number; total: number; customizations?: string[] }> {
  const arr = extractItemsArray(rawItems);
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr.map((it: Record<string, unknown>, idx: number) => {
    const qty = Number(it.quantity) ?? 1;
    const unitPrice = Number(it.price ?? it.unit_price ?? 0);
    const total = Number(it.total ?? it.total_price ?? unitPrice * qty);
    const name = String(it.name ?? it.item_name ?? `Item ${idx + 1}`).trim();
    const customizations = Array.isArray(it.customizations) ? (it.customizations as string[]) : undefined;
    return { name, quantity: qty, price: unitPrice, total, customizations };
  });
}

type CoreRow = Record<string, unknown>;
type FoodRow = Record<string, unknown>;

/**
 * GET /api/food-orders?store_id=…
 * Primary source: orders_core (all order types for the store). Enriched with orders_food when present.
 * Query params: orders_food_id (single), orders_core_id (single), status, limit
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id') || searchParams.get('storeId');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const ordersFoodIdRaw = searchParams.get('orders_food_id');
    const ordersFoodId =
      ordersFoodIdRaw != null && ordersFoodIdRaw !== '' ? parseInt(ordersFoodIdRaw, 10) : NaN;
    const ordersCoreIdRaw = searchParams.get('orders_core_id');
    const ordersCoreId =
      ordersCoreIdRaw != null && ordersCoreIdRaw !== '' ? parseInt(ordersCoreIdRaw, 10) : NaN;

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const db = getSupabase();
    const store = await resolveStoreId(db, storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const storeNameRow = await db.from('merchant_stores').select('store_name').eq('id', store.id).single();
    const defaultStoreName = (storeNameRow.data as { store_name?: string } | null)?.store_name ?? null;

    let coreRows: CoreRow[] = [];
    let foodByCoreId = new Map<number, FoodRow>();

    if (Number.isFinite(ordersFoodId)) {
      const { data: foodOne, error: foodErr } = await db.from('orders_food').select('*').eq('id', ordersFoodId).single();
      if (foodErr || !foodOne) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      const f = foodOne as FoodRow;
      if (Number(f.merchant_store_id) !== store.id) {
        return NextResponse.json({ error: 'Store mismatch' }, { status: 403 });
      }
      const corePk = Number(f.order_id);
      const { data: coreOne } = await db.from('orders_core').select('*').eq('id', corePk).single();
      if (!coreOne) {
        return NextResponse.json({ error: 'Core order not found' }, { status: 404 });
      }
      coreRows = [coreOne as CoreRow];
      foodByCoreId = new Map([[corePk, f]]);
    } else if (Number.isFinite(ordersCoreId)) {
      const { data: coreOne, error: cErr } = await db.from('orders_core').select('*').eq('id', ordersCoreId).single();
      if (cErr || !coreOne) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (Number((coreOne as CoreRow).merchant_store_id) !== store.id) {
        return NextResponse.json({ error: 'Store mismatch' }, { status: 403 });
      }
      coreRows = [coreOne as CoreRow];
      const { data: foodOne } = await db
        .from('orders_food')
        .select('*')
        .eq('order_id', ordersCoreId)
        .maybeSingle();
      foodByCoreId = new Map();
      if (foodOne) foodByCoreId.set(ordersCoreId, foodOne as FoodRow);
    } else {
      let q = db
        .from('orders_core')
        .select('*')
        .eq('merchant_store_id', store.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) {
        if (status === 'all') {
          /* no filter */
        } else if (status === 'active') {
          q = q.in('status', ['assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit']);
        } else {
          q = q.eq('status', status);
        }
      }

      const { data: cores, error: cErr } = await q;
      if (cErr) {
        console.error('[food-orders GET] orders_core:', cErr);
        return NextResponse.json({ error: cErr.message }, { status: 500 });
      }
      coreRows = (cores || []) as CoreRow[];

      const coreIds = coreRows.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
      foodByCoreId = new Map();
      if (coreIds.length > 0) {
        const { data: foods } = await db.from('orders_food').select('*').in('order_id', coreIds);
        for (const fr of foods || []) {
          const fk = Number((fr as FoodRow).order_id);
          if (Number.isFinite(fk)) foodByCoreId.set(fk, fr as FoodRow);
        }
      }
    }

    const customerIds = [
      ...new Set(coreRows.map((c) => c.customer_id).filter((x) => x != null).map((x) => Number(x))),
    ];
    const customerById = new Map<
      number,
      {
        full_name?: string | null;
        primary_mobile?: string | null;
        trust_score?: unknown;
        fraud_score?: unknown;
        risk_flag?: unknown;
      }
    >();
    if (customerIds.length > 0) {
      const { data: custs } = await db
        .from('customers')
        .select('id, full_name, primary_mobile, trust_score, fraud_score, risk_flag')
        .in('id', customerIds);
      for (const c of custs || []) {
        const row = c as {
          id: number;
          full_name?: string | null;
          primary_mobile?: string | null;
          trust_score?: unknown;
          fraud_score?: unknown;
          risk_flag?: unknown;
        };
        customerById.set(row.id, {
          full_name: row.full_name,
          primary_mobile: row.primary_mobile,
          trust_score: row.trust_score,
          fraud_score: row.fraud_score,
          risk_flag: row.risk_flag,
        });
      }
    }

    // For current page orders only: compute historical order count per customer (per store).
    const customerOrderCountById = new Map<number, number>();
    if (customerIds.length > 0) {
      await Promise.all(
        customerIds.map(async (cid) => {
          try {
            const { count } = await db
              .from('orders_core')
              .select('id', { count: 'exact', head: true })
              .eq('merchant_store_id', store.id)
              .eq('customer_id', cid);
            customerOrderCountById.set(cid, typeof count === 'number' ? count : 0);
          } catch {
            customerOrderCountById.set(cid, 0);
          }
        })
      );
    }

    const riderIds = [
      ...new Set(coreRows.map((c) => c.rider_id).filter((x) => x != null).map((x) => Number(x))),
    ];
    const riderById = new Map<number, Record<string, unknown>>();
    if (riderIds.length > 0) {
      const { data: riders } = await db
        .from('riders')
        .select('id, name, mobile, selfie_url, status, city, lat, lon')
        .in('id', riderIds);
      for (const r of riders || []) {
        riderById.set(Number((r as { id: number }).id), r as Record<string, unknown>);
      }
    }

    const ordersWithDetails = await Promise.all(
      coreRows.map(async (core) => {
        const coreId = Number(core.id);
        const food = foodByCoreId.get(coreId) ?? null;
        const coreStatus = String(core.status ?? 'assigned');
        const currentSt = (core.current_status as string | null) ?? null;
        const uiStatus = resolvePartnerPipeline(
          food ? (food.order_status as string | null) : null,
          coreStatus,
          currentSt
        );

        const rawItems =
          food != null &&
          food.items != null &&
          Array.isArray(food.items) &&
          (food.items as unknown[]).length > 0
            ? food.items
            : core.items != null && extractItemsArray(core.items).length > 0
              ? core.items
              : [];
        const items = normalizeOrderItems(rawItems);

        const riderId = core.rider_id != null ? Number(core.rider_id) : null;
        const riderDetails = riderId != null ? riderById.get(riderId) ?? null : null;

        const custId = core.customer_id != null ? Number(core.customer_id) : null;
        const cust = custId != null ? customerById.get(custId) : null;
        const customerScores =
          cust != null
            ? {
                trust_score: cust.trust_score as number | null | undefined,
                fraud_score: cust.fraud_score as number | null | undefined,
                risk_flag: cust.risk_flag as string | null | undefined,
              }
            : null;

        const foodTotal = food != null ? food.food_items_total_value : null;
        const coreGrand = core.grand_total ?? core.item_total;

        const merged = {
          ...(food || {}),
          id: food != null ? Number(food.id) : coreId,
          core_only: food == null,
          orders_food_row_id: food != null ? Number(food.id) : null,
          core_order_id: coreId,
          core_status: coreStatus,
          current_status: currentSt,
          order_type: core.order_type,
          order_id: coreId,
          merchant_store_id: Number(core.merchant_store_id),
          merchant_parent_id: core.merchant_parent_id != null ? Number(core.merchant_parent_id) : null,
          restaurant_name: (food?.restaurant_name as string | null) ?? defaultStoreName,
          restaurant_phone: (food?.restaurant_phone as string | null) ?? null,
          preparation_time_minutes:
            food?.preparation_time_minutes != null ? Number(food.preparation_time_minutes) : null,
          food_items_count: food?.food_items_count != null ? Number(food.food_items_count) : null,
          food_items_total_value: foodTotal ?? coreGrand ?? 0,
          requires_utensils: food?.requires_utensils ?? null,
          is_fragile: food?.is_fragile ?? false,
          is_high_value: food?.is_high_value ?? false,
          veg_non_veg: food?.veg_non_veg ?? null,
          delivery_instructions: (food?.delivery_instructions as string | null) ?? null,
          customer_id: custId,
          customer_name:
            (food?.customer_name as string | null) ??
            cust?.full_name ??
            ((core as Record<string, unknown>).customer_name as string | null) ??
            ((core as Record<string, unknown>).order_for_name as string | null) ??
            ((core as Record<string, unknown>).contact_person_name as string | null) ??
            null,
          customer_phone: (food?.customer_phone as string | null) ?? cust?.primary_mobile ?? null,
          customer_email: (food?.customer_email as string | null) ?? null,
          customer_order_count: custId != null ? customerOrderCountById.get(custId) ?? null : null,
          rider_id: riderId,
          rider_name: (riderDetails?.name as string | null) ?? (food?.rider_name as string | null) ?? null,
          rider_phone: (riderDetails?.mobile as string | null) ?? (food?.rider_phone as string | null) ?? null,
          rider_details: riderDetails
            ? {
                id: Number(riderDetails.id),
                name: riderDetails.name as string,
                mobile: riderDetails.mobile as string,
                selfie_url: riderDetails.selfie_url as string | null,
                status: riderDetails.status as string | undefined,
                city: riderDetails.city as string | null,
                lat: riderDetails.lat != null ? Number(riderDetails.lat) : null,
                lon: riderDetails.lon != null ? Number(riderDetails.lon) : null,
              }
            : null,
          drop_address_raw: (core.drop_address_raw as string) ?? null,
          drop_address_normalized: (core.drop_address_normalized as string) ?? null,
          formatted_order_id: (core.formatted_order_id as string) ?? (food?.formatted_order_id as string) ?? null,
          is_bulk_order: Boolean((core as Record<string, unknown>).is_bulk_order),
          order_status: uiStatus,
          accepted_at: (food?.accepted_at as string | null) ?? null,
          prepared_at: (food?.prepared_at as string | null) ?? null,
          dispatched_at: (food?.dispatched_at as string | null) ?? null,
          delivered_at: (food?.delivered_at as string | null) ?? null,
          cancelled_at: (food?.cancelled_at as string | null) ?? (core.cancelled_at as string | null) ?? null,
          rejected_reason: (food?.rejected_reason as string | null) ?? null,
          cancelled_by: (food?.cancelled_by as string | null) ?? (core.cancelled_by as string | null) ?? null,
          cancelled_by_type: (food?.cancelled_by_type as string | null) ?? (core.cancelled_by_type as string | null) ?? null,
          cancellation_details: food?.cancellation_details ?? core.cancellation_details ?? null,
          created_at: String(food?.created_at ?? core.created_at),
          updated_at: String(food?.updated_at ?? core.updated_at),
          items,
          customer_scores: customerScores,
        };

        return merged;
      })
    );

    console.log(
      `[food-orders GET] ${ordersWithDetails.length} partner orders (orders_core–centric) for store_id=${storeId}`
    );

    return NextResponse.json({ orders: ordersWithDetails });
  } catch (err) {
    console.error('[food-orders] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
