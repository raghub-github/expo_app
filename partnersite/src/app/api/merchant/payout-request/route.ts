import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { WALLET_CONSTANTS, roundMoney } from '@/lib/wallet-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/payout-request
 * Body: { storeId, amount, bank_account_id }
 *
 * HOLD-based withdrawal flow:
 * 1. Validate inputs, auth, balance
 * 2. Check for duplicate pending withdrawals (max 3)
 * 3. HOLD_LOCK: Debit AVAILABLE → Credit HOLD (atomic via RPC)
 * 4. Insert payout request linked to hold ledger entry
 * 5. On later completion: HOLD → DEBIT (separate flow)
 * 6. On failure: HOLD → release back to AVAILABLE
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
    if (isNaN(amount) || amount < WALLET_CONSTANTS.MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json({ error: `Amount must be at least ₹${WALLET_CONSTANTS.MIN_WITHDRAWAL_AMOUNT}` }, { status: 400 });
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

    // Duplicate withdrawal prevention
    const { data: pendingPayouts } = await db
      .from('merchant_payout_requests')
      .select('id')
      .eq('wallet_id', walletId)
      .in('status', ['PENDING', 'APPROVED', 'PROCESSING']);
    if ((pendingPayouts?.length ?? 0) >= WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS) {
      return NextResponse.json({
        error: `Maximum ${WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed. Wait for existing ones to complete.`,
      }, { status: 429 });
    }

    const { data: bankRow, error: bankErr } = await db
      .from('merchant_store_bank_accounts')
      .select('id, store_id')
      .eq('id', bankAccountId)
      .single();
    if (bankErr || !bankRow || (bankRow.store_id as number) !== merchantStoreId) {
      return NextResponse.json({ error: 'Invalid bank account' }, { status: 400 });
    }

    // Full amount to merchant — no withdrawal-time commission
    const commissionPercentage = 0;
    const commissionAmount = 0;
    const netPayoutAmount = roundMoney(amount);

    // STEP 1: HOLD funds — debit AVAILABLE
    const holdKey = `payout_hold_${walletId}_${Date.now()}`;
    const { data: holdLedgerId, error: holdDebitErr } = await db.rpc('merchant_wallet_debit', {
      p_wallet_id: walletId,
      p_amount: amount,
      p_category: 'HOLD_LOCK',
      p_balance_type: 'AVAILABLE',
      p_reference_type: 'WITHDRAWAL',
      p_reference_id: 0,
      p_idempotency_key: holdKey,
      p_description: `Withdrawal requested: ₹${amount.toFixed(2)}`,
      p_metadata: { source: 'partnersite' },
    });

    if (holdDebitErr) {
      console.error('[merchant/payout-request] hold debit failed:', holdDebitErr);
      return NextResponse.json({ error: holdDebitErr.message || 'Insufficient balance or wallet frozen' }, { status: 400 });
    }

    // STEP 2: Credit HOLD bucket
    const { error: holdCreditErr } = await db.rpc('merchant_wallet_credit', {
      p_wallet_id: walletId,
      p_amount: amount,
      p_category: 'HOLD_LOCK',
      p_balance_type: 'HOLD',
      p_reference_type: 'WITHDRAWAL',
      p_reference_id: 0,
      p_idempotency_key: holdKey + '_credit_hold',
      p_description: `Withdrawal requested (processing): ₹${amount.toFixed(2)}`,
      p_metadata: { hold_debit_ledger_id: holdLedgerId },
    });

    if (holdCreditErr) {
      console.error('[merchant/payout-request] hold credit failed:', holdCreditErr);
      // Reverse the debit — release back to AVAILABLE
      await db.rpc('merchant_wallet_credit', {
        p_wallet_id: walletId,
        p_amount: amount,
        p_category: 'FAILED_WITHDRAWAL_REVERSAL',
        p_balance_type: 'AVAILABLE',
        p_reference_type: 'WITHDRAWAL',
        p_reference_id: 0,
        p_idempotency_key: holdKey + '_reversal',
        p_description: `Hold credit failed — reversal`,
        p_metadata: { reason: 'hold_credit_failed' },
      });
      return NextResponse.json({ error: 'Wallet hold failed. Please try again.' }, { status: 500 });
    }

    // STEP 3: Insert payout request
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
        hold_ledger_id: holdLedgerId,
        requested_by_id: user.id,
        requested_by_email: user.email ?? null,
      })
      .select('id, amount, commission_percentage, commission_amount, net_payout_amount, status, requested_at')
      .single();

    if (insertErr) {
      console.error('[merchant/payout-request] insert failed:', insertErr);
      // Reverse the hold — debit HOLD, credit AVAILABLE
      await db.rpc('merchant_wallet_debit', {
        p_wallet_id: walletId,
        p_amount: amount,
        p_category: 'HOLD_RELEASE',
        p_balance_type: 'HOLD',
        p_reference_type: 'WITHDRAWAL',
        p_reference_id: 0,
        p_idempotency_key: holdKey + '_release_debit',
        p_description: 'Payout insert failed — releasing hold',
        p_metadata: { reason: 'payout_insert_failed' },
      });
      await db.rpc('merchant_wallet_credit', {
        p_wallet_id: walletId,
        p_amount: amount,
        p_category: 'FAILED_WITHDRAWAL_REVERSAL',
        p_balance_type: 'AVAILABLE',
        p_reference_type: 'WITHDRAWAL',
        p_reference_id: 0,
        p_idempotency_key: holdKey + '_release_credit',
        p_description: 'Payout insert failed — funds released',
        p_metadata: { reason: 'payout_insert_failed' },
      });
      return NextResponse.json({ error: insertErr.message || 'Failed to create payout request' }, { status: 500 });
    }

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
        hold_ledger_id: holdLedgerId,
        requested_at: payoutRow.requested_at,
      },
      ...actor,
      ip_address: ip,
      user_agent: ua,
      audit_metadata: { description: `Withdrawal requested: ₹${Number(payoutRow.amount).toFixed(2)} (funds held)` },
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
      hold_ledger_id: holdLedgerId,
    });
  } catch (e) {
    console.error('[merchant/payout-request]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
