import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { roundMoney } from '@/lib/wallet-types';
import {
  istDateKeyFromIso,
  istDateKeysForLastDays,
  istDayLabel,
  resolveMerchantStoreId,
  resolveMerchantWalletId,
} from '@/lib/merchant-wallet-resolve';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Period = 'week' | 'month' | 'quarter';

function parsePeriod(raw: string | null): Period {
  if (raw === 'month' || raw === 'quarter') return raw;
  return 'week';
}

async function sumLedgerEarnings(db: ReturnType<typeof getDb>, walletId: number): Promise<number> {
  const { data } = await db
    .from('merchant_wallet_ledger')
    .select('amount')
    .eq('wallet_id', walletId)
    .eq('direction', 'CREDIT')
    .eq('category', 'ORDER_EARNING');
  return roundMoney(
    (data ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0)
  );
}

/**
 * GET /api/merchant/wallet/analytics?storeId=GMMC1015&period=week|month|quarter
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const period = parsePeriod(req.nextUrl.searchParams.get('period'));
    const dayCount = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const dateKeys = istDateKeysForLastDays(dayCount);
    const rangeStartKey = dateKeys[0];
    const rangeStartIso = `${rangeStartKey}T00:00:00+05:30`;

    const db = getDb();
    const merchantStoreId = await resolveMerchantStoreId(db, storeId.trim());
    if (merchantStoreId == null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let walletId = await resolveMerchantWalletId(db, merchantStoreId);
    if (walletId == null) {
      const { data: newId, error: rpcError } = await db.rpc('get_or_create_merchant_wallet', {
        p_merchant_store_id: merchantStoreId,
      });
      if (rpcError || newId == null) {
        return NextResponse.json({
          success: true,
          period,
          series: dateKeys.map((date) => ({
            date,
            label: istDayLabel(date, period === 'week' ? 'weekday' : 'short'),
            earnings: 0,
            withdrawals: 0,
          })),
          period_total_earnings: 0,
          period_total_withdrawals: 0,
          period_transaction_count: 0,
          total_earned: 0,
          total_withdrawn: 0,
        });
      }
      walletId = newId as number;
    }

    const { data: walletRow } = await db
      .from('merchant_wallet')
      .select('total_earned, total_withdrawn')
      .eq('id', walletId)
      .single();

    const { data: ledgerRows, error: ledgerErr } = await db
      .from('merchant_wallet_ledger')
      .select('amount, direction, category, created_at')
      .eq('wallet_id', walletId)
      .gte('created_at', rangeStartIso);

    if (ledgerErr) {
      console.error('[merchant/wallet/analytics]', ledgerErr);
      return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
    }

    const earningsByDay = new Map<string, number>();
    const withdrawalsByDay = new Map<string, number>();
    for (const k of dateKeys) {
      earningsByDay.set(k, 0);
      withdrawalsByDay.set(k, 0);
    }

    let period_transaction_count = 0;
    for (const row of ledgerRows ?? []) {
      const cat = String(row.category ?? '').toUpperCase();
      const dir = String(row.direction ?? '').toUpperCase();
      const amt = Number(row.amount ?? 0);
      if (!(amt > 0)) continue;

      const isEarning = cat === 'ORDER_EARNING' && dir === 'CREDIT';
      const isWithdrawal =
        (cat === 'WITHDRAWAL' || cat === 'WITHDRAWAL_DEBIT') && dir === 'DEBIT';
      if (!isEarning && !isWithdrawal) continue;

      const key = istDateKeyFromIso(String(row.created_at));
      if (!earningsByDay.has(key)) continue;

      period_transaction_count += 1;
      if (isEarning) {
        earningsByDay.set(key, (earningsByDay.get(key) ?? 0) + amt);
      } else if (isWithdrawal) {
        withdrawalsByDay.set(key, (withdrawalsByDay.get(key) ?? 0) + amt);
      }
    }

    const series = dateKeys.map((date) => ({
      date,
      label: istDayLabel(date, period === 'week' ? 'weekday' : 'short'),
      earnings: roundMoney(earningsByDay.get(date) ?? 0),
      withdrawals: roundMoney(withdrawalsByDay.get(date) ?? 0),
    }));

    const period_total_earnings = roundMoney(
      series.reduce((s, p) => s + p.earnings, 0)
    );
    const period_total_withdrawals = roundMoney(
      series.reduce((s, p) => s + p.withdrawals, 0)
    );

    let totalEarned = roundMoney(Number(walletRow?.total_earned ?? 0));
    if (totalEarned <= 0) {
      totalEarned = await sumLedgerEarnings(db, walletId);
    }

    return NextResponse.json({
      success: true,
      period,
      series,
      period_total_earnings,
      period_total_withdrawals,
      period_transaction_count,
      total_earned: totalEarned,
      total_withdrawn: roundMoney(Number(walletRow?.total_withdrawn ?? 0)),
    });
  } catch (e) {
    console.error('[merchant/wallet/analytics]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
