import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface RiderLogEntry {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

/**
 * GET /api/food-orders/[id]/riders-log
 * Returns all rider assignments for this order (for Rider's log modal).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getSupabase();
    const foodOrderId = parseInt(id, 10);
    if (isNaN(foodOrderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const { data: foodOrder, error: foodErr } = await db
      .from('orders_food')
      .select('order_id')
      .eq('id', foodOrderId)
      .single();

    if (foodErr || !foodOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderId = foodOrder.order_id as number;

    const { data: assignments, error: assignErr } = await db
      .from('order_rider_assignments')
      .select('id, rider_id, rider_name, rider_mobile, assignment_status, assigned_at, accepted_at, rejected_at, reached_merchant_at, picked_up_at, delivered_at, cancelled_at')
      .eq('order_id', orderId)
      .order('assigned_at', { ascending: false });

    if (assignErr) {
      console.error('[riders-log] Error:', assignErr);
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }

    if (!assignments?.length) {
      return NextResponse.json({ riders: [] } as { riders: RiderLogEntry[] });
    }

    const riderIds = [...new Set((assignments as { rider_id: number }[]).map((a) => a.rider_id))];
    const { data: riders } = await db
      .from('riders')
      .select('id, name, mobile, selfie_url')
      .in('id', riderIds);

    const riderMap = new Map(
      (riders || []).map((r: { id: number; name: string | null; mobile: string | null; selfie_url: string | null }) => [r.id, r])
    );

    const ridersLog: RiderLogEntry[] = (assignments as any[]).map((a) => {
      const r = riderMap.get(a.rider_id);
      return {
        rider_id: a.rider_id,
        rider_name: a.rider_name ?? r?.name ?? null,
        rider_mobile: a.rider_mobile ?? r?.mobile ?? null,
        selfie_url: r?.selfie_url ?? null,
        assignment_status: a.assignment_status ?? 'pending',
        assigned_at: a.assigned_at ?? null,
        accepted_at: a.accepted_at ?? null,
        rejected_at: a.rejected_at ?? null,
        reached_merchant_at: a.reached_merchant_at ?? null,
        picked_up_at: a.picked_up_at ?? null,
        delivered_at: a.delivered_at ?? null,
        cancelled_at: a.cancelled_at ?? null,
      };
    });

    return NextResponse.json({ riders: ridersLog });
  } catch (err) {
    console.error('[riders-log] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
