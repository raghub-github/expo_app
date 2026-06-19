import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { syncExpiredOrderAcceptanceForStore } from '@/lib/order-acceptance-timeout-sync';
import { fetchBackend } from '@/lib/fetch-backend';

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

    const backendRes = await fetchBackend(
      `/v1/merchant-partner/stores/${gate.storeIdNum}/sync-acceptance-timeout`,
      {
        method: 'POST',
        headers: {
          cookie: req.headers.get('cookie') ?? '',
        },
        timeoutMs: 12_000,
      }
    );

    if (backendRes?.ok) {
      const body = (await backendRes.json().catch(() => ({}))) as { cancelled?: number };
      const cancelled = typeof body.cancelled === 'number' ? body.cancelled : 0;
      return NextResponse.json(
        { cancelled, store_id: String(storeId).trim() },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
      );
    }

    const db = getDb();
    const { cancelled } = await syncExpiredOrderAcceptanceForStore(db, gate.storeIdNum);
    return NextResponse.json(
      { cancelled, store_id: String(storeId).trim() },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (e) {
    console.error('[sync-acceptance-timeout]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
