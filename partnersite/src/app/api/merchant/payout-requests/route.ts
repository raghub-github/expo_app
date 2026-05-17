import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { roundMoney } from '@/lib/wallet-types';
import { resolveMerchantStoreId, resolveMerchantWalletId } from '@/lib/merchant-wallet-resolve';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sumNet(rows: { net_payout_amount?: unknown; amount?: unknown }[]): number {
  return rows.reduce((s, r) => s + Number(r.net_payout_amount ?? r.amount ?? 0), 0);
}

/**
 * GET /api/merchant/payout-requests?storeId=GMMC1015&limit=5
 * Payout summary by status + recent withdrawal requests for the payments dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const limit = Math.min(20, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '5', 10) || 5));

    const db = getDb();
    const merchantStoreId = await resolveMerchantStoreId(db, storeId!.trim());
    if (merchantStoreId == null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const walletId = await resolveMerchantWalletId(db, merchantStoreId);
    if (walletId == null) {
      return NextResponse.json({
        success: true,
        summary: {
          paid: 0,
          in_process: 0,
          pending: 0,
          failed: 0,
          total: 0,
        },
        recent: [],
      });
    }

    const { data: allPayouts, error } = await db
      .from('merchant_payout_requests')
      .select(
        'id, amount, net_payout_amount, status, requested_at, completed_at, utr_reference, failure_reason, bank_account_id'
      )
      .eq('wallet_id', walletId)
      .order('requested_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[merchant/payout-requests]', error);
      return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
    }

    const rows = allPayouts ?? [];
    const paidRows = rows.filter((r) => r.status === 'COMPLETED');
    const inProcessRows = rows.filter((r) => r.status === 'APPROVED' || r.status === 'PROCESSING');
    const pendingRows = rows.filter((r) => r.status === 'PENDING');
    const failedRows = rows.filter(
      (r) => r.status === 'FAILED' || r.status === 'CANCELLED' || r.status === 'REVERSED'
    );

    const paid = roundMoney(sumNet(paidRows));
    const in_process = roundMoney(sumNet(inProcessRows));
    const pending = roundMoney(sumNet(pendingRows));
    const failed = roundMoney(sumNet(failedRows));
    const total = roundMoney(paid + in_process + pending + failed);

    const recent = rows.slice(0, limit).map((r) => ({
      id: r.id as number,
      amount: roundMoney(Number(r.amount ?? 0)),
      net_payout_amount: roundMoney(Number(r.net_payout_amount ?? r.amount ?? 0)),
      status: String(r.status ?? 'PENDING'),
      requested_at: r.requested_at as string,
      completed_at: (r.completed_at as string | null) ?? null,
      utr_reference: (r.utr_reference as string | null) ?? null,
      failure_reason: (r.failure_reason as string | null) ?? null,
    }));

    return NextResponse.json({
      success: true,
      summary: { paid, in_process, pending, failed, total },
      recent,
    });
  } catch (e) {
    console.error('[merchant/payout-requests]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
