import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMerchantOrderRiderTracking } from '@/lib/merchant-rider-tracking';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/food-orders/[id]/rider-tracking
 * Rider live location, trail, pickup/drop pins for merchant map.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const foodOrderId = parseInt(id, 10);
    if (Number.isNaN(foodOrderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const db = getSupabase();
    const { data: foodOrder, error: foodErr } = await db
      .from('orders_food')
      .select('order_id')
      .eq('id', foodOrderId)
      .single();

    if (foodErr || !foodOrder?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const payload = await getMerchantOrderRiderTracking(db, foodOrder.order_id as number);
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[rider-tracking] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
