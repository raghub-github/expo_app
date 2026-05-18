import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type OrderTimelineEntry = {
  id: number;
  status: string;
  previous_status: string | null;
  status_message: string | null;
  actor_type: string | null;
  occurred_at: string;
  expected_by_at: string | null;
  metadata: Record<string, unknown> | null;
};

async function resolveCorePkFromFood(
  db: ReturnType<typeof getSupabase>,
  foodOrderId: number
): Promise<number | null> {
  const { data: foodOrder, error: foodErr } = await db
    .from('orders_food')
    .select('order_id, core_order_id')
    .eq('id', foodOrderId)
    .maybeSingle();

  if (foodErr || !foodOrder) return null;

  if (foodOrder.order_id != null && Number.isFinite(Number(foodOrder.order_id))) {
    return Number(foodOrder.order_id);
  }

  const textId = String(foodOrder.core_order_id ?? '').trim();
  if (!textId) return null;

  const { data: core } = await db
    .from('orders_core')
    .select('id')
    .eq('order_id', textId)
    .maybeSingle();

  return core?.id != null ? Number(core.id) : null;
}

/**
 * GET /api/food-orders/[id]/timeline
 * orders_food.id → orders_core.id → order_timelines.order_id
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
    const coreOrderId = await resolveCorePkFromFood(db, foodOrderId);
    if (coreOrderId == null) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: rows, error } = await db
      .from('order_timelines')
      .select(
        'id, status, previous_status, status_message, actor_type, occurred_at, expected_by_at, metadata'
      )
      .eq('order_id', coreOrderId)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[timeline] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ timeline: (rows ?? []) as OrderTimelineEntry[] });
  } catch (err) {
    console.error('[timeline] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
