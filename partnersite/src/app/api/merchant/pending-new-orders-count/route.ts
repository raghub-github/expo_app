/**
 * GET /api/merchant/pending-new-orders-count?store_id=GMMC1001
 * Count of orders still awaiting merchant acceptance (partner UI CREATED pipeline).
 * Excludes orders past the acceptance window (those should be auto-cancelled).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { isNetworkOrTransientError } from '@/lib/auth/session-errors';
import { countPendingNewOrders } from '@/lib/count-pending-new-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env not configured');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const db = getDb();
    const count = await countPendingNewOrders(db, gate.storeIdNum);

    return NextResponse.json(
      { count, store_id: String(storeId).trim() },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch (e) {
    if (isNetworkOrTransientError(e)) {
      return NextResponse.json(
        { count: 0, store_id: null, error: 'Auth service unavailable' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      );
    }
    console.error('[pending-new-orders-count]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
