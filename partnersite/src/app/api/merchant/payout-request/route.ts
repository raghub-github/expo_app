import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/payout-request
 * Body: { storeId, amount, bank_account_id }
 * Creates a withdrawal request, debits wallet by requested amount (before commission), and adds a WITHDRAWAL ledger entry.
 * Main wallet and transaction history update immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeId = body.storeId ?? body.store_id;
    const amountParam = body.amount;
    const bankAccountId = body.bank_account_id != null ? Number(body.bank_account_id) : null;

    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    const amount = amountParam != null ? parseFloat(String(amountParam)) : NaN;
    if (isNaN(amount) || amount < 100) {
      return NextResponse.json({ error: 'Amount must be at least ₹100' }, { status: 400 });
    }
    if (bankAccountId == null || bankAccountId <= 0) {
      return NextResponse.json({ error: 'bank_account_id is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: validation.error ?? 'Merchant not found' }, { status: 403 });
    }

    const db = getDb();

    const { data: storeData, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId.trim())
      .single();
    if (storeErr || !storeData) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    const merchantStoreId = storeData.id as number;
    const parentId = storeData.parent_id as number | null;
    if (parentId !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not accessible' }, { status: 403 });
    }

    const { data: wallet, error: walletErr } = await db
      .from('merchant_wallet')
      .select('id, available_balance')
      .eq('merchant_store_id', merchantStoreId)
      .single();
    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }
    const walletId = wallet.id as number;
    const availableBalance = Number(wallet.available_balance ?? 0);
    if (amount > availableBalance) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const { data: bankRow, error: bankErr } = await db
      .from('merchant_store_bank_accounts')
      .select('id, store_id')
      .eq('id', bankAccountId)
      .single();
    if (bankErr || !bankRow || (bankRow.store_id as number) !== merchantStoreId) {
      return NextResponse.json({ error: 'Invalid bank account' }, { status: 400 });
    }

    let commissionPercentage = 0;
    const today = new Date().toISOString().slice(0, 10);
    const effectiveToFilter = `effective_to.is.null,effective_to.gte.${today}`;
    let { data: rule } = await db
      .from('platform_commission_rules')
      .select('commission_percentage')
      .eq('merchant_store_id', merchantStoreId)
      .lte('effective_from', today)
      .or(effectiveToFilter)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();
    if (!rule && parentId != null) {
      const res = await db
        .from('platform_commission_rules')
        .select('commission_percentage')
        .eq('merchant_parent_id', parentId)
        .lte('effective_from', today)
        .or(effectiveToFilter)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();
      rule = res.data;
    }
    if (rule?.commission_percentage != null) {
      commissionPercentage = Number(rule.commission_percentage);
    }

    const commissionAmount = Math.round((amount * (commissionPercentage / 100)) * 100) / 100;
    const netPayoutAmount = Math.round((amount - commissionAmount) * 100) / 100;

    const { data: payoutRow, error: insertErr } = await db
      .from('merchant_payout_requests')
      .insert({
        wallet_id: walletId,
        amount,
        status: 'PENDING',
        commission_percentage: commissionPercentage,
        commission_amount: commissionAmount,
        net_payout_amount: netPayoutAmount,
        bank_account_id: bankAccountId,
        requested_by_id: user.id,
        requested_by_email: user.email ?? null,
      })
      .select('id, amount, commission_percentage, commission_amount, net_payout_amount, status, requested_at')
      .single();

    if (insertErr) {
      console.error('[merchant/payout-request]', insertErr);
      return NextResponse.json({ error: insertErr.message || 'Failed to create payout request' }, { status: 500 });
    }

    const payoutRequestId = payoutRow.id as number;
    const idempotencyKey = `payout_withdrawal_${payoutRequestId}`;
    const description = `Withdrawal request #${payoutRequestId} (net ₹${netPayoutAmount.toFixed(2)} after ${commissionPercentage}% deduction)`;

    const { data: ledgerId, error: debitErr } = await db.rpc('merchant_wallet_debit', {
      p_wallet_id: walletId,
      p_amount: amount,
      p_category: 'WITHDRAWAL',
      p_balance_type: 'AVAILABLE',
      p_reference_type: 'WITHDRAWAL',
      p_reference_id: payoutRequestId,
      p_idempotency_key: idempotencyKey,
      p_description: description,
      p_metadata: { payout_request_id: payoutRequestId, commission_amount: commissionAmount, net_payout_amount: netPayoutAmount },
    });

    if (debitErr) {
      console.error('[merchant/payout-request] merchant_wallet_debit:', debitErr);
      await db.from('merchant_payout_requests').update({ status: 'CANCELLED' }).eq('id', payoutRequestId);
      return NextResponse.json({ error: 'Wallet debit failed. Withdrawal cancelled.' }, { status: 500 });
    }

    await db
      .from('merchant_payout_requests')
      .update({ debit_ledger_id: ledgerId, updated_at: new Date().toISOString() })
      .eq('id', payoutRequestId);

    const actor = await getAuditActor();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    await logMerchantAudit(db, {
      entity_type: 'STORE',
      entity_id: merchantStoreId,
      action: 'CREATE',
      action_field: 'WITHDRAWAL_REQUEST',
      new_value: {
        payout_request_id: payoutRow.id,
        amount: payoutRow.amount,
        bank_account_id: bankAccountId,
        status: payoutRow.status,
        commission_percentage: payoutRow.commission_percentage,
        commission_amount: payoutRow.commission_amount,
        net_payout_amount: payoutRow.net_payout_amount,
        requested_at: payoutRow.requested_at,
      },
      ...actor,
      ip_address: ip,
      user_agent: ua,
      audit_metadata: { description: `Withdrawal requested: ₹${Number(payoutRow.amount).toFixed(2)}` },
    });

    return NextResponse.json({
      success: true,
      payout_request_id: payoutRow.id,
      amount: payoutRow.amount,
      commission_percentage: payoutRow.commission_percentage,
      commission_amount: payoutRow.commission_amount,
      net_payout_amount: payoutRow.net_payout_amount,
      status: payoutRow.status,
      requested_at: payoutRow.requested_at,
    });
  } catch (e) {
    console.error('[merchant/payout-request]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
