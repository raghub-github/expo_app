import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { roundMoney } from '@/lib/wallet-types';
import { backfillMissingDeliveredOrderCredits } from '@/lib/backfill-merchant-wallet-credits';
import {
  deriveWalletBucketsFromLedger,
  mergeWalletBuckets,
} from '@/lib/reconcile-merchant-wallet-balances';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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
 * Returns wallet summary (V2) for the store: all balance buckets,
 * lifetime totals, today/yesterday earnings, pending withdrawals.
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

    // Heal missing ORDER_EARNING rows for orders delivered outside merchant PATCH (e.g. dashboard agent).
    try {
      await backfillMissingDeliveredOrderCredits(db, merchantStoreId);
    } catch (backfillErr) {
      console.warn('[merchant/wallet] backfill credits:', backfillErr);
    }

    const { data: wallet, error: walletError } = await db
      .from('merchant_wallet')
      .select(`
        id, available_balance, pending_balance, hold_balance, reserve_balance,
        locked_balance, pending_settlement, lifetime_credit, lifetime_debit,
        total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
      `)
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
    let locked_balance = 0;
    let pending_settlement = 0;
    let lifetime_credit = 0;
    let lifetime_debit = 0;
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
      locked_balance = Number(wallet.locked_balance ?? 0);
      pending_settlement = Number(wallet.pending_settlement ?? 0);
      lifetime_credit = Number(wallet.lifetime_credit ?? 0);
      lifetime_debit = Number(wallet.lifetime_debit ?? 0);
      total_earned = Number(wallet.total_earned ?? 0);
      total_withdrawn = Number(wallet.total_withdrawn ?? 0);
      total_penalty = Number(wallet.total_penalty ?? 0);
      total_commission_deducted = Number(wallet.total_commission_deducted ?? 0);
      status = (wallet.status as string) ?? 'ACTIVE';
    } else {
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
        locked_balance = Number(newWallet.locked_balance ?? 0);
        pending_settlement = Number(newWallet.pending_settlement ?? 0);
        lifetime_credit = Number(newWallet.lifetime_credit ?? 0);
        lifetime_debit = Number(newWallet.lifetime_debit ?? 0);
        total_earned = Number(newWallet.total_earned ?? 0);
        total_withdrawn = Number(newWallet.total_withdrawn ?? 0);
        total_penalty = Number(newWallet.total_penalty ?? 0);
        total_commission_deducted = Number(newWallet.total_commission_deducted ?? 0);
        status = (newWallet.status as string) ?? 'ACTIVE';
      }
    }

    const derivedBuckets = await deriveWalletBucketsFromLedger(db, walletId);
    const merged = mergeWalletBuckets(
      {
        available_balance,
        locked_balance,
        pending_balance,
        hold_balance,
        reserve_balance,
      },
      derivedBuckets
    );
    available_balance = merged.available_balance;
    locked_balance = merged.locked_balance;
    pending_balance = merged.pending_balance;
    hold_balance = merged.hold_balance;
    reserve_balance = merged.reserve_balance;

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const { data: ledgerRows } = await db
      .from('merchant_wallet_ledger')
      .select('amount, created_at')
      .eq('wallet_id', walletId)
      .eq('direction', 'CREDIT')
      .eq('category', 'ORDER_EARNING')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayEnd.toISOString());

    let today_earning = 0;
    let yesterday_earning = 0;
    (ledgerRows || []).forEach((row) => {
      const amt = Number(row.amount ?? 0);
      const at = row.created_at ? new Date(row.created_at as string) : null;
      if (!at) return;
      if (at >= todayStart && at < todayEnd) today_earning += amt;
      else if (at >= yesterdayStart && at < todayStart) yesterday_earning += amt;
    });

    let pending_withdrawal_total = 0;
    let in_process_withdrawal_total = 0;
    try {
      const { data: payoutRows } = await db
        .from('merchant_payout_requests')
        .select('net_payout_amount, status')
        .eq('wallet_id', walletId)
        .in('status', ['PENDING', 'APPROVED', 'PROCESSING']);
      (payoutRows || []).forEach((row) => {
        const amt = Number(row.net_payout_amount ?? 0);
        const st = String(row.status ?? '').toUpperCase();
        if (st === 'PENDING') pending_withdrawal_total += amt;
        else if (st === 'APPROVED' || st === 'PROCESSING') in_process_withdrawal_total += amt;
      });
    } catch {
      // Table may not exist or RLS may block
    }

    let locked_settlement_total = locked_balance;
    let settlement_paused = false;
    try {
      const { data: sp } = await db
        .from('merchant_wallet')
        .select('settlement_paused')
        .eq('id', walletId)
        .single();
      settlement_paused = Boolean(sp?.settlement_paused);
    } catch {
      /* pre-0239 */
    }
    try {
      const { data: lockedRows } = await db
        .from('payment_order_settlements')
        .select('merchant_net')
        .eq('wallet_id', walletId)
        .in('lifecycle_status', ['LOCKED', 'HOLD']);
      locked_settlement_total = (lockedRows ?? []).reduce(
        (s, r) => s + Number(r.merchant_net ?? 0),
        0
      );
    } catch {
      locked_settlement_total = locked_balance;
    }
    if (locked_settlement_total <= 0 && locked_balance > 0) {
      locked_settlement_total = locked_balance;
    }

    const withdrawable_balance = roundMoney(available_balance + locked_balance);
    const total_balance = roundMoney(
      available_balance + locked_balance + hold_balance + pending_balance
    );

    return NextResponse.json({
      success: true,
      wallet_id: walletId,
      store_id: storeId,
      available_balance: roundMoney(available_balance),
      pending_balance: roundMoney(pending_balance),
      hold_balance: roundMoney(hold_balance),
      reserve_balance: roundMoney(reserve_balance),
      locked_balance: roundMoney(locked_balance),
      pending_settlement: roundMoney(pending_settlement),
      lifetime_credit: roundMoney(lifetime_credit),
      lifetime_debit: roundMoney(lifetime_debit),
      total_earned: roundMoney(total_earned),
      total_withdrawn: roundMoney(total_withdrawn),
      total_penalty: roundMoney(total_penalty),
      total_commission_deducted: roundMoney(total_commission_deducted),
      status,
      today_earning: roundMoney(today_earning),
      yesterday_earning: roundMoney(yesterday_earning),
      pending_withdrawal_total: roundMoney(pending_withdrawal_total),
      in_process_withdrawal_total: roundMoney(in_process_withdrawal_total),
      locked_settlement_total: roundMoney(locked_settlement_total),
      withdrawable_balance,
      total_balance,
      settlement_paused,
    });
  } catch (e) {
    console.error('[merchant/wallet]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
