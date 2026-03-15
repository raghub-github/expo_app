import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(db: ReturnType<typeof getDb>, storeId: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeId)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/wallet?storeId=GMMC1015
 * Returns wallet summary for the store: balances, today's earning, yesterday's earning.
 * Uses merchant_wallet and merchant_wallet_ledger (ORDER_EARNING credits by day).
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const db = getDb();
    const merchantStoreId = await resolveStoreInternalId(db, storeId.trim());
    if (merchantStoreId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get or create wallet (wallet uses merchant_store_id = internal id)
    const { data: wallet, error: walletError } = await db
      .from('merchant_wallet')
      .select('id, available_balance, pending_balance, hold_balance, reserve_balance, total_earned, total_withdrawn, total_penalty, total_commission_deducted, status')
      .eq('merchant_store_id', merchantStoreId)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
      console.error('[merchant/wallet]', walletError);
      return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 });
    }

    let walletId: number;
    let available_balance = 0;
    let pending_balance = 0;
    let hold_balance = 0;
    let reserve_balance = 0;
    let total_earned = 0;
    let total_withdrawn = 0;
    let total_penalty = 0;
    let total_commission_deducted = 0;
    let status = 'ACTIVE';

    if (wallet) {
      walletId = wallet.id as number;
      available_balance = Number(wallet.available_balance ?? 0);
      pending_balance = Number(wallet.pending_balance ?? 0);
      hold_balance = Number(wallet.hold_balance ?? 0);
      reserve_balance = Number(wallet.reserve_balance ?? 0);
      total_earned = Number(wallet.total_earned ?? 0);
      total_withdrawn = Number(wallet.total_withdrawn ?? 0);
      total_penalty = Number(wallet.total_penalty ?? 0);
      total_commission_deducted = Number(wallet.total_commission_deducted ?? 0);
      status = (wallet.status as string) ?? 'ACTIVE';
    } else {
      // Create wallet via RPC if exists
      const { data: newId, error: rpcError } = await db.rpc('get_or_create_merchant_wallet', {
        p_merchant_store_id: merchantStoreId,
      });
      if (rpcError || newId == null) {
        return NextResponse.json({ error: 'Wallet not found and could not be created' }, { status: 404 });
      }
      walletId = newId as number;
      const { data: newWallet } = await db.from('merchant_wallet').select('*').eq('id', walletId).single();
      if (newWallet) {
        available_balance = Number(newWallet.available_balance ?? 0);
        pending_balance = Number(newWallet.pending_balance ?? 0);
        hold_balance = Number(newWallet.hold_balance ?? 0);
        reserve_balance = Number(newWallet.reserve_balance ?? 0);
        total_earned = Number(newWallet.total_earned ?? 0);
        total_withdrawn = Number(newWallet.total_withdrawn ?? 0);
        total_penalty = Number(newWallet.total_penalty ?? 0);
        total_commission_deducted = Number(newWallet.total_commission_deducted ?? 0);
        status = (newWallet.status as string) ?? 'ACTIVE';
      }
    }

    // Today and yesterday bounds (UTC for consistency with DB)
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();
    const yesterdayStartIso = yesterdayStart.toISOString();

    // Sum ORDER_EARNING credits for today and yesterday from ledger
    const { data: ledgerRows } = await db
      .from('merchant_wallet_ledger')
      .select('amount, created_at')
      .eq('wallet_id', walletId)
      .eq('direction', 'CREDIT')
      .eq('category', 'ORDER_EARNING')
      .gte('created_at', yesterdayStartIso)
      .lt('created_at', todayEndIso);

    let today_earning = 0;
    let yesterday_earning = 0;
    (ledgerRows || []).forEach((row) => {
      const amt = Number(row.amount ?? 0);
      const at = row.created_at ? new Date(row.created_at as string) : null;
      if (!at) return;
      if (at >= todayStart && at < todayEnd) today_earning += amt;
      else if (at >= yesterdayStart && at < todayStart) yesterday_earning += amt;
    });

    // Pending withdrawal: sum of payout requests with status PENDING (for this wallet)
    let pending_withdrawal_total = 0;
    try {
      const { data: payoutRows } = await db
        .from('merchant_payout_requests')
        .select('net_payout_amount')
        .eq('wallet_id', walletId)
        .eq('status', 'PENDING');
      (payoutRows || []).forEach((row) => {
        pending_withdrawal_total += Number(row.net_payout_amount ?? 0);
      });
    } catch {
      // Table may not exist or RLS may block; leave 0
    }

    return NextResponse.json({
      success: true,
      wallet_id: walletId,
      store_id: storeId,
      available_balance: Math.round(available_balance * 100) / 100,
      pending_balance: Math.round(pending_balance * 100) / 100,
      pending_withdrawal_total: Math.round(pending_withdrawal_total * 100) / 100,
      hold_balance: Math.round(hold_balance * 100) / 100,
      reserve_balance: Math.round(reserve_balance * 100) / 100,
      total_earned: Math.round(total_earned * 100) / 100,
      total_withdrawn: Math.round(total_withdrawn * 100) / 100,
      total_penalty: Math.round(total_penalty * 100) / 100,
      total_commission_deducted: Math.round(total_commission_deducted * 100) / 100,
      status,
      today_earning: Math.round(today_earning * 100) / 100,
      yesterday_earning: Math.round(yesterday_earning * 100) / 100,
    });
  } catch (e) {
    console.error('[merchant/wallet]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
