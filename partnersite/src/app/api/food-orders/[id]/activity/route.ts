import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

/**
 * GET /api/food-orders/[id]/activity?store_id=…
 * Recent merchant status actions for an orders_food row.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = new URL(req.url).searchParams.get('store_id');
    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const orderIdNum = parseInt(id, 10);
    if (isNaN(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: food, error: foodErr } = await db
      .from('orders_food')
      .select('id, order_id, merchant_store_id')
      .eq('id', orderIdNum)
      .single();

    if (foodErr || !food) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (food.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: actions, error: actErr } = await db
      .from('merchant_order_food_actions')
      .select('id, from_status, to_status, action_source, actor_label, metadata, created_at')
      .eq('orders_food_id', orderIdNum)
      .order('created_at', { ascending: false })
      .limit(30);

    if (actErr) {
      console.warn('[food-orders activity] query failed:', actErr.message);
      return NextResponse.json({ actions: [] });
    }

    return NextResponse.json({ actions: actions ?? [] });
  } catch (err) {
    console.error('[food-orders activity] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
