import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Same active pipeline as Fastify GET .../active-orders-count */
const ACTIVE_STATUSES = ['assigned', 'accepted', 'reached_store', 'picked_up'];

export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();
    const { count, error } = await db
      .from('orders_core')
      .select('*', { count: 'exact', head: true })
      .eq('merchant_store_id', gate.storeIdNum)
      .in('status', ACTIVE_STATUSES);
    if (error) {
      console.error('[active-orders-count]', error);
      return NextResponse.json({ error: 'Failed to count orders' }, { status: 500 });
    }
    return NextResponse.json({
      store_id: gate.storeIdNum,
      active_orders: count ?? 0,
    });
  } catch (e) {
    console.error('[active-orders-count]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
