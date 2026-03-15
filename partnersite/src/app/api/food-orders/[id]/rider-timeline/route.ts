import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/food-orders/[id]/rider-timeline?rider_id=123
 * Fetches rider assignment timeline for an order
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const riderId = searchParams.get('rider_id');

    if (!riderId) {
      return NextResponse.json({ error: 'rider_id is required' }, { status: 400 });
    }

    const db = getSupabase();
    const orderIdNum = parseInt(id, 10);
    if (isNaN(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    // Get order_id from orders_food (which references orders_core.id)
    const { data: foodOrder } = await db
      .from('orders_food')
      .select('order_id')
      .eq('id', orderIdNum)
      .single();

    if (!foodOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch rider assignment from order_rider_assignments
    // Note: order_rider_assignments.order_id references orders.id, but we're using orders_core
    // Try to find assignment by orders_core.id first, then fallback to orders.id
    let assignment = null;

    // First try: Look for assignment using orders_core.id (if order_rider_assignments references orders_core)
    const { data: assignment1, error: error1 } = await db
      .from('order_rider_assignments')
      .select('assigned_at, accepted_at, reached_merchant_at, picked_up_at, delivered_at')
      .eq('order_id', foodOrder.order_id)
      .eq('rider_id', parseInt(riderId, 10))
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignment1) {
      assignment = assignment1;
    } else {
      // Fallback: Check if there's a mapping or use orders_core timestamps directly
      // For now, return structure with nulls - the frontend will handle it
      assignment = null;
    }

    if (error1 && error1.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[rider-timeline] Error:', error1);
      return NextResponse.json({ error: error1.message }, { status: 500 });
    }

    // If no assignment found in order_rider_assignments, try to get timestamps from orders_core
    if (!assignment) {
      const { data: coreOrder } = await db
        .from('orders_core')
        .select('actual_pickup_time, actual_delivery_time, rider_id, created_at')
        .eq('id', foodOrder.order_id)
        .single();

      // If rider matches, return structure with assigned_at set to order creation time
      if (coreOrder && coreOrder.rider_id === parseInt(riderId, 10)) {
        // Map orders_core timestamps to rider timeline format
        // Set assigned_at to order creation time to show rider was assigned
        return NextResponse.json({
          assigned_at: coreOrder.created_at || null, // Use order creation time as assigned time
          accepted_at: null, // Not available in orders_core
          reached_merchant_at: null, // Not available in orders_core
          picked_up_at: coreOrder.actual_pickup_time || null,
          delivered_at: coreOrder.actual_delivery_time || null,
        });
      }

      // Return empty structure if rider doesn't match
      return NextResponse.json({
        assigned_at: null,
        accepted_at: null,
        reached_merchant_at: null,
        picked_up_at: null,
        delivered_at: null,
      });
    }

    return NextResponse.json(assignment);
  } catch (err) {
    console.error('[rider-timeline] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
