import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { WALLET_CONSTANTS } from '@/lib/wallet-types';
import { createMerchantPayoutViaEngine } from '@/lib/merchant-withdrawal-engine-client';

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
 * Session auth stays on Partner Site. The hold + payout row is created by the
 * Fastify merchant wallet engine so Merchant App and Partner Site cannot diverge.
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

    const engine = await createMerchantPayoutViaEngine(
      merchantStoreId,
      amount,
      bankAccountId,
      'partnersite',
    );
    if (!engine.ok) {
      return NextResponse.json({
        success: false,
        error: engine.data.error ?? 'Withdrawal failed',
        code: engine.data.code,
        freezeReason: engine.data.freezeReason ?? null,
      }, { status: engine.status });
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
        payout_request_id: engine.data.payout_request_id,
        amount: engine.data.amount ?? amount,
        bank_account_id: bankAccountId,
        status: engine.data.status,
        commission_percentage: engine.data.commission_percentage,
        commission_amount: engine.data.commission_amount,
        net_payout_amount: engine.data.net_payout_amount,
        hold_ledger_id: engine.data.hold_ledger_id,
        requested_at: engine.data.requested_at,
        engine: 'fastify_merchant_wallet',
      },
      ...actor,
      ip_address: ip,
      user_agent: ua,
      audit_metadata: {
        description: `Withdrawal requested: ₹${Number(engine.data.amount ?? amount).toFixed(2)} (funds held)`,
      },
    });

    return NextResponse.json({
      success: true,
      payout_request_id: engine.data.payout_request_id,
      amount: engine.data.amount ?? amount,
      commission_percentage: engine.data.commission_percentage ?? 0,
      commission_amount: engine.data.commission_amount ?? 0,
      net_payout_amount: engine.data.net_payout_amount ?? amount,
      status: engine.data.status ?? 'PENDING',
      requested_at: engine.data.requested_at,
      hold_ledger_id: engine.data.hold_ledger_id ?? null,
      idempotent: engine.data.idempotent === true,
    });
  } catch (e) {
    console.error('[merchant/payout-request]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
