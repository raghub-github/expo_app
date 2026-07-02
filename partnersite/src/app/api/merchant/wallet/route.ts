import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { roundMoney } from '@/lib/wallet-types';
import { withRouteTimeout, RouteTimeoutError } from '@/lib/route-timeout';
import { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger } from '@/lib/backfill-merchant-wallet-credits';
import { latestRunningBalanceFromLedgerRows } from '@/lib/merchant-wallet-ledger-display';

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
    return await withRouteTimeout('merchant.wallet.get', 45_000, async () => {
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
    // Time-boxed: the backfill iterates ledger rows and can hang for minutes on
    // large stores. If it doesn't finish in 10s we skip and continue with the
    // rest of the wallet summary, so the route returns fast. A real backfill
    // still runs periodically via the scheduled worker.
    try {
      const backfillWithTimeout = Promise.race([
        (async () => {
          await backfillMissingDeliveredOrderCredits(db, merchantStoreId);
          await backfillMissingCancelledOrderLedger(db, merchantStoreId);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('backfill_timeout_10s')), 10_000),
        ),
      ]);
      await backfillWithTimeout;
    } catch (backfillErr) {
      console.warn('[merchant/wallet] backfill skipped/failed:', (backfillErr as Error).message);
    }

    // V2 select includes locked_balance + lifetime columns. Older prod DBs may
    // not have those columns yet — Postgres returns code 42703 (undefined_column)
    // and PostgREST surfaces it as PGRST204. Fall back to V1 column set and
    // default the missing V2 fields to 0 so the route never 500s on schema drift.
    let wallet: Record<string, unknown> | null = null;
    let walletError: { code?: string; message?: string } | null = null;
    {
      const v2 = await db
        .from('merchant_wallet')
        .select(`
          id, available_balance, pending_balance, hold_balance, reserve_balance,
          locked_balance, pending_settlement, lifetime_credit, lifetime_debit,
          total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
        `)
        .eq('merchant_store_id', merchantStoreId)
        .single();
      const schemaDrift =
        v2.error?.code === '42703' ||
        v2.error?.code === 'PGRST204' ||
        (v2.error?.message ?? '').includes('does not exist');
      if (schemaDrift) {
        console.warn(
          '[merchant/wallet] V2 columns missing in prod DB, falling back to V1 select:',
          v2.error?.message
        );
        const v1 = await db
          .from('merchant_wallet')
          .select(`
            id, available_balance, pending_balance, hold_balance, reserve_balance,
            total_earned, total_withdrawn, status
          `)
          .eq('merchant_store_id', merchantStoreId)
          .single();
        wallet = (v1.data as Record<string, unknown> | null) ?? null;
        walletError = v1.error ?? null;
      } else {
        wallet = (v2.data as Record<string, unknown> | null) ?? null;
        walletError = v2.error ?? null;
      }
    }

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

    const storedAvailableBeforeLedger = available_balance;

    const { data: balanceLedgerRows } = await db
      .from('merchant_wallet_ledger')
      .select('id, balance_type, balance_after, amount, direction, created_at, metadata')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(5000);

    const ledgerRunningBalance = latestRunningBalanceFromLedgerRows(
      (balanceLedgerRows ?? []).map((row) => ({
        id: row.id as number,
        balance_type: row.balance_type as string | null,
        balance_after: row.balance_after != null ? Number(row.balance_after) : null,
        amount: row.amount != null ? Number(row.amount) : null,
        direction: row.direction as string | null,
        created_at: row.created_at as string,
        metadata: row.metadata as Record<string, unknown> | null,
      }))
    );

    if ((balanceLedgerRows ?? []).length > 0) {
      available_balance = ledgerRunningBalance;
    }
    locked_balance = 0;

    if (
      (balanceLedgerRows ?? []).length > 0 &&
      Math.abs(storedAvailableBeforeLedger - ledgerRunningBalance) >= 0.01
    ) {
      try {
        const { client: sql } = await import('@/lib/drizzle');
        await sql`
          UPDATE merchant_wallet
          SET available_balance = ${ledgerRunningBalance},
              updated_at = NOW()
          WHERE id = ${walletId}
        `;
      } catch (syncErr) {
        console.warn('[merchant/wallet] sync available from ledger:', syncErr);
      }
    }

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

    const withdrawable_balance = roundMoney(available_balance);
    const total_balance = roundMoney(available_balance + hold_balance + pending_balance);

    if (total_earned <= 0) {
      const { data: earningRows } = await db
        .from('merchant_wallet_ledger')
        .select('amount')
        .eq('wallet_id', walletId)
        .eq('direction', 'CREDIT')
        .eq('category', 'ORDER_EARNING');
      total_earned = roundMoney(
        (earningRows ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0)
      );
    }

    return NextResponse.json({
      success: true,
      wallet_id: walletId,
      store_id: storeId,
      available_balance: roundMoney(available_balance),
      pending_balance: roundMoney(pending_balance),
      hold_balance: roundMoney(hold_balance),
      reserve_balance: roundMoney(reserve_balance),
      locked_balance: 0,
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
      locked_settlement_total: 0,
      withdrawable_balance,
      total_balance,
      settlement_paused,
    });
    });
  } catch (e) {
    if (e instanceof RouteTimeoutError) {
      console.warn('[merchant/wallet] timeout after', e.ms, 'ms');
      return NextResponse.json({ error: 'timeout' }, { status: 504 });
    }
    console.error('[merchant/wallet]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
