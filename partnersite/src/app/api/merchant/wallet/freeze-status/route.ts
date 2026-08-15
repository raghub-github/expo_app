import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/wallet/freeze-status?storeId=GMMC1015
 * Cheap freeze poll for live Withdraw disable (no ledger / payout math).
 */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
  if (!storeId?.trim()) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const db = getDb();
  const { data: store, error: storeErr } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeId.trim())
    .maybeSingle();
  if (storeErr || !store?.id) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const { data: wallet } = await db
    .from('merchant_wallet')
    .select('status, frozen_reason, frozen_at')
    .eq('merchant_store_id', store.id)
    .maybeSingle();

  const status = String(wallet?.status ?? 'ACTIVE').toUpperCase() || 'ACTIVE';
  const isFrozen = status === 'FROZEN';
  const freezeReason =
    isFrozen && typeof wallet?.frozen_reason === 'string' && wallet.frozen_reason.trim()
      ? wallet.frozen_reason.trim()
      : null;

  return NextResponse.json({
    success: true,
    store_id: storeId.trim(),
    storeId: Number(store.id),
    isFrozen,
    freezeReason,
    frozenAt: isFrozen && wallet?.frozen_at ? String(wallet.frozen_at) : null,
    status,
  });
}
