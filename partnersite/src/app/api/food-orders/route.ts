import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return { id: data.id as number };
}

/**
 * GET /api/food-orders?store_id=GMMC1001&status=NEW&limit=100
 * Fetches orders_food for the merchant store, filtered by optional status.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id') || searchParams.get('storeId');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const db = getSupabase();
    const store = await resolveStoreId(db, storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Select orders_food - drop_address will be fetched from orders_core via order_id
    let query = db
      .from('orders_food')
      .select('*')
      .eq('merchant_store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      if (status === 'all') {
        // Don't filter by status
      } else if (status === 'active') {
        // Active orders: CREATED, ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY
        query = query.in('order_status', ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']);
      } else {
        query = query.eq('order_status', status);
      }
    }

    const { data: ordersData, error } = await query;

    if (error) {
      console.error('[food-orders GET] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    /** Normalize raw items (from orders_food or orders_core JSONB) to shape UI expects: name, quantity, price, total */
    function normalizeOrderItems(rawItems: unknown): Array<{ name: string; quantity: number; price: number; total: number; customizations?: string[] }> {
      if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
      return rawItems.map((it: Record<string, unknown>, idx: number) => {
        const qty = Number(it.quantity) ?? 1;
        const unitPrice = Number(it.price ?? it.unit_price ?? 0);
        const total = Number(it.total ?? it.total_price ?? unitPrice * qty);
        const name = String(it.name ?? it.item_name ?? `Item ${idx + 1}`).trim();
        const customizations = Array.isArray(it.customizations) ? it.customizations as string[] : undefined;
        return { name, quantity: qty, price: unitPrice, total, customizations };
      });
    }

    // Fetch drop_address, items fallback, and rider from orders_core for each order
    const ordersWithDetails = await Promise.all(
      (ordersData || []).map(async (order: any) => {
        // Get drop_address, formatted_order_id, and items (fallback when orders_food.items is null) from orders_core
        const { data: coreData } = await db
          .from('orders_core')
          .select('drop_address_raw, drop_address_normalized, rider_id, formatted_order_id, items')
          .eq('id', order.order_id)
          .single();

        // Use orders_food.items first; fallback to orders_core.items when null/empty (all states)
        const rawItems = (order.items != null && Array.isArray(order.items) && order.items.length > 0)
          ? order.items
          : (coreData?.items != null && Array.isArray(coreData.items) && coreData.items.length > 0)
            ? coreData.items
            : [];
        const items = normalizeOrderItems(rawItems);

        // Get rider details if rider_id exists (from orders_core or orders_food)
        let riderDetails = null;
        const riderId = coreData?.rider_id || order.rider_id;
        if (riderId) {
          const { data: riderData } = await db
            .from('riders')
            .select('id, name, mobile, selfie_url, status, city, lat, lon')
            .eq('id', riderId)
            .single();
          riderDetails = riderData;
        }

        // Get customer trust/fraud scores for character flag
        let customerScores = null;
        if (order.customer_id) {
          const { data: customerData } = await db
            .from('customers')
            .select('trust_score, fraud_score, risk_flag')
            .eq('id', order.customer_id)
            .single();
          customerScores = customerData;
        }

        return {
          ...order,
          items,
          drop_address_raw: coreData?.drop_address_raw || null,
          drop_address_normalized: coreData?.drop_address_normalized || null,
          formatted_order_id: coreData?.formatted_order_id || order.formatted_order_id || null,
          rider_details: riderDetails,
          rider_name: riderDetails?.name || order.rider_name,
          rider_phone: riderDetails?.mobile || order.rider_phone,
          customer_scores: customerScores,
        };
      })
    );

    console.log(`[food-orders GET] Found ${ordersWithDetails.length} orders for store_id=${storeId} (internal_id=${store.id})`);
    
    return NextResponse.json({ orders: ordersWithDetails });
  } catch (err) {
    console.error('[food-orders] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
