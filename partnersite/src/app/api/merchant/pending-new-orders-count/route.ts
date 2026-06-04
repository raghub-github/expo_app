import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/pending-new-orders-count?store_id=GMMC1001
 * Count of orders still awaiting merchant acceptance (partner UI CREATED / PLACED pipeline), all time (capped scan).
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const db = getSupabase();
    const { data: store, error: storeErr } = await db
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId.trim())
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const internalId = store.id as number;

    const { data: rows, error } = await db
      .from('orders_core')
      .select('status, current_status')
      .eq('merchant_store_id', internalId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[pending-new-orders-count]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let count = 0;
    for (const o of rows || []) {
      const row = o as { status?: string; current_status?: string | null };
      if (resolvePartnerPipeline(null, row.status ?? 'assigned', row.current_status ?? null) === 'CREATED') {
        count += 1;
      }
    }

    return NextResponse.json({ count, store_id: storeId.trim() });
  } catch (e) {
    console.error('[pending-new-orders-count]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
