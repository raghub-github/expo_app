import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/payout-request/[id]?storeId=GMMC1015
 * Returns payout request details including linked bank account (for ledger withdrawal expand).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payoutId = parseInt(id, 10);
    if (isNaN(payoutId)) {
      return NextResponse.json({ error: 'Invalid payout request id' }, { status: 400 });
    }
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');

    const db = getDb();

    const { data: payout, error: payoutErr } = await db
      .from('merchant_payout_requests')
      .select('id, wallet_id, amount, net_payout_amount, commission_percentage, commission_amount, status, bank_account_id, utr_reference, failure_reason, requested_at, approved_at, processed_at, completed_at')
      .eq('id', payoutId)
      .single();

    if (payoutErr || !payout) {
      return NextResponse.json({ error: 'Payout request not found' }, { status: 404 });
    }

    if (storeId?.trim()) {
      const { data: wallet } = await db
        .from('merchant_wallet')
        .select('merchant_store_id')
        .eq('id', payout.wallet_id)
        .single();
      const { data: store } = await db
        .from('merchant_stores')
        .select('store_id')
        .eq('id', wallet?.merchant_store_id)
        .single();
      if (store?.store_id !== storeId.trim()) {
        return NextResponse.json({ error: 'Payout not found for this store' }, { status: 404 });
      }
    }

    let bank = null;
    if (payout.bank_account_id) {
      const { data: bankRow } = await db
        .from('merchant_store_bank_accounts')
        .select('id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, payout_method, upi_id')
        .eq('id', payout.bank_account_id)
        .single();
      if (bankRow) {
        const accNum = bankRow.account_number as string;
        bank = {
          id: bankRow.id,
          account_holder_name: bankRow.account_holder_name,
          account_number_masked: accNum ? `****${accNum.slice(-4)}` : null,
          ifsc_code: bankRow.ifsc_code,
          bank_name: bankRow.bank_name,
          branch_name: bankRow.branch_name,
          payout_method: bankRow.payout_method,
          upi_id: bankRow.upi_id,
        };
      }
    }

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        amount: Number(payout.amount),
        net_payout_amount: Number(payout.net_payout_amount),
        commission_percentage: Number(payout.commission_percentage),
        commission_amount: Number(payout.commission_amount),
        status: payout.status,
        utr_reference: payout.utr_reference,
        failure_reason: payout.failure_reason,
        requested_at: payout.requested_at,
        approved_at: payout.approved_at,
        processed_at: payout.processed_at,
        completed_at: payout.completed_at,
      },
      bank,
    });
  } catch (e) {
    console.error('[merchant/payout-request GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
