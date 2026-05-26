import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/food-orders/[id]/rider-tracking
 * Latest rider position for this food order (order_rider_tracking + assignment).
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
      .select('order_id, rider_id, rider_name, rider_phone')
      .eq('id', foodOrderId)
      .single();

    if (foodErr || !foodOrder?.order_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const coreOrderId = foodOrder.order_id as number;

    const { data: tracking } = await db
      .from('order_rider_tracking')
      .select('latitude, longitude, heading_degrees, created_at')
      .eq('order_id', coreOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let riderName = foodOrder.rider_name as string | null;
    let riderMobile = foodOrder.rider_phone as string | null;
    let selfieUrl: string | null = null;

    const riderId = foodOrder.rider_id as number | null;
    if (riderId) {
      const { data: rider } = await db
        .from('riders')
        .select('name, mobile, selfie_url')
        .eq('id', riderId)
        .maybeSingle();
      if (rider) {
        riderName = riderName ?? (rider.name as string | null);
        riderMobile = riderMobile ?? (rider.mobile as string | null);
        selfieUrl = (rider.selfie_url as string | null) ?? null;
      }
    }

    const { data: assignment } = await db
      .from('order_rider_assignments')
      .select('rider_name, rider_mobile, assignment_status')
      .eq('order_id', coreOrderId)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignment) {
      riderName = riderName ?? (assignment.rider_name as string | null);
      riderMobile = riderMobile ?? (assignment.rider_mobile as string | null);
    }

    return NextResponse.json({
      rider: {
        name: riderName,
        mobile: riderMobile,
        selfie_url: selfieUrl,
        assignment_status: assignment?.assignment_status ?? null,
      },
      location: tracking
        ? {
            latitude: Number(tracking.latitude),
            longitude: Number(tracking.longitude),
            heading_degrees: tracking.heading_degrees,
            updated_at: tracking.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error('[rider-tracking] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
