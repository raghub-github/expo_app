import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchNearbyDispatchRidersForOrderCore } from '@/lib/fetch-nearby-dispatch-riders';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** GET /api/food-orders/[id]/nearby-riders — on-duty riders near store pickup (pre-assign). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ordersFoodId = parseInt(id, 10);
    if (Number.isNaN(ordersFoodId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const db = getSupabase();
    const { data: foodOrder, error: foodErr } = await db
      .from('orders_food')
      .select('order_id, rider_id')
      .eq('id', ordersFoodId)
      .single();

    if (foodErr || !foodOrder?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (foodOrder.rider_id != null) {
      return NextResponse.json({ ok: true, summary: null, riderAssigned: true });
    }

    const { data: core } = await db
      .from('orders_core')
      .select('rider_id')
      .eq('id', foodOrder.order_id as number)
      .maybeSingle();

    if (core?.rider_id != null) {
      return NextResponse.json({ ok: true, summary: null, riderAssigned: true });
    }

    const { data: currentAssignment } = await db
      .from('order_rider_assignments_current')
      .select('rider_id')
      .eq('order_id', foodOrder.order_id as number)
      .maybeSingle();

    if (currentAssignment?.rider_id != null) {
      return NextResponse.json({ ok: true, summary: null, riderAssigned: true });
    }

    const summary = await fetchNearbyDispatchRidersForOrderCore(foodOrder.order_id as number);
    return NextResponse.json({ ok: true, summary, riderAssigned: false });
  } catch (err) {
    console.error('[nearby-riders] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
