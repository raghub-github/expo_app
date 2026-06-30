import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { syncExpiredOrderAcceptanceForStore } from '@/lib/order-acceptance-timeout-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * POST /api/merchant/sync-acceptance-timeout?store_id=GMMC1001
 * Cancels unaccepted orders past the acceptance window (runs on portal open).
 */
export async function POST(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { cancelled } = await syncExpiredOrderAcceptanceForStore(supabaseAdmin, gate.storeIdNum);

    return NextResponse.json(
      { cancelled, store_id: String(storeId).trim() },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (e) {
    console.error('[sync-acceptance-timeout]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
