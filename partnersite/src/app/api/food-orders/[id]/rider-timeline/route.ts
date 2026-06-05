import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type RiderTimelineEvent = {
  event_type: string;
  occurred_at: string;
  merchant_distance_km: number | null;
  customer_distance_km: number | null;
  status_message: string | null;
};

/**
 * GET /api/food-orders/[id]/rider-timeline?rider_id=123
 * Rider milestone timeline for one assignment (Assigned → Reached → Picked up → Delivered).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const riderId = parseInt(searchParams.get('rider_id') ?? '', 10);

    if (!Number.isFinite(riderId)) {
      return NextResponse.json({ error: 'rider_id is required' }, { status: 400 });
    }

    const foodOrderId = parseInt(id, 10);
    if (Number.isNaN(foodOrderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const db = getSupabase();

    const { data: foodOrder } = await db
      .from('orders_food')
      .select('order_id')
      .eq('id', foodOrderId)
      .maybeSingle();

    if (!foodOrder?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const coreId = Number(foodOrder.order_id);

    const { data: assignment } = await db
      .from('order_rider_assignments')
      .select(
        'id, assigned_at, accepted_at, reached_merchant_at, picked_up_at, delivered_at, rejected_at, cancelled_at, unassigned_at'
      )
      .eq('order_core_id', coreId)
      .eq('rider_id', riderId)
      .order('is_active', { ascending: false })
      .order('assignment_sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    let resolvedAssignment = assignment;

    if (!resolvedAssignment?.id) {
      const { data: legacy } = await db
        .from('order_rider_assignments')
        .select(
          'id, assigned_at, accepted_at, reached_merchant_at, picked_up_at, delivered_at, rejected_at, cancelled_at, unassigned_at'
        )
        .eq('order_id', coreId)
        .eq('rider_id', riderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedAssignment = legacy;
    }

    if (!resolvedAssignment?.id) {
      return NextResponse.json({
        assigned_at: null,
        accepted_at: null,
        reached_merchant_at: null,
        picked_up_at: null,
        delivered_at: null,
        events: [] as RiderTimelineEvent[],
      });
    }

    const { data: events } = await db
      .from('order_rider_assignment_timeline_events')
      .select(
        'event_type, occurred_at, merchant_distance_km, customer_distance_km, status_message'
      )
      .eq('rider_assignment_id', resolvedAssignment.id)
      .order('occurred_at', { ascending: true });

    const timelineEvents = (events ?? []) as RiderTimelineEvent[];

    const pick = (type: string) =>
      timelineEvents.find((e) => e.event_type === type)?.occurred_at ?? null;

    return NextResponse.json({
      assigned_at: resolvedAssignment.assigned_at ?? pick('assigned'),
      accepted_at: resolvedAssignment.accepted_at ?? pick('accepted'),
      reached_merchant_at: resolvedAssignment.reached_merchant_at ?? pick('reached_merchant'),
      picked_up_at: resolvedAssignment.picked_up_at ?? pick('picked_up'),
      delivered_at: resolvedAssignment.delivered_at ?? pick('delivered'),
      events: timelineEvents,
    });
  } catch (err) {
    console.error('[rider-timeline] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
