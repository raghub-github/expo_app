import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';

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
 * GET /api/merchant/bank-accounts?storeId=GMMC1015
 * Returns all bank/UPI accounts for the store (including disabled). No delete; disable only.
 * Table: merchant_store_bank_accounts; store_id here is merchant_stores.id (internal numeric id).
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId.trim());
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: rows, error } = await db
      .from('merchant_store_bank_accounts')
      .select('id, store_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, is_verified, verification_status, upi_id, is_primary, is_active, is_disabled, payout_method, bank_proof_type, bank_proof_file_url, upi_qr_screenshot_url, created_at, updated_at')
      .eq('store_id', storeInternalId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[merchant/bank-accounts]', error);
      return NextResponse.json({ error: 'Failed to load bank accounts' }, { status: 500 });
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      store_id: r.store_id,
      account_holder_name: r.account_holder_name,
      account_number: r.account_number,
      account_number_masked: r.account_number ? `****${String(r.account_number).slice(-4)}` : null,
      ifsc_code: r.ifsc_code,
      bank_name: r.bank_name,
      branch_name: r.branch_name,
      account_type: r.account_type,
      is_verified: !!r.is_verified,
      verification_status: r.verification_status,
      upi_id: r.upi_id,
      is_primary: !!r.is_primary,
      is_active: r.is_active !== false,
      is_disabled: !!r.is_disabled,
      payout_method: r.payout_method,
      bank_proof_type: r.bank_proof_type,
      bank_proof_file_url: r.bank_proof_file_url,
      upi_qr_screenshot_url: r.upi_qr_screenshot_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({ success: true, accounts: list });
  } catch (e) {
    console.error('[merchant/bank-accounts]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/merchant/bank-accounts
 * Body: storeId, payout_method ('bank'|'upi'), account_holder_name, account_number, ifsc_code, bank_name, branch_name?, account_type?, upi_id?, bank_proof_file_url?, upi_qr_screenshot_url?, bank_proof_type?
 * Adds a new bank/UPI. If first account, sets as default (is_primary). Attachments stored in R2; pass URL or key from upload.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeId = body.storeId ?? body.store_id;
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const payoutMethod = (body.payout_method || 'bank').toLowerCase();
    if (!['bank', 'upi'].includes(payoutMethod)) {
      return NextResponse.json({ error: 'payout_method must be bank or upi' }, { status: 400 });
    }

    const accountHolderName = body.account_holder_name?.trim();
    const accountNumber = body.account_number?.trim();
    const ifscCode = body.ifsc_code?.trim();
    const bankName = body.bank_name?.trim();
    if (!accountHolderName || !accountNumber) {
      return NextResponse.json({ error: 'account_holder_name and account_number are required' }, { status: 400 });
    }
    if (payoutMethod === 'bank' && (!ifscCode || !bankName)) {
      return NextResponse.json({ error: 'ifsc_code and bank_name required for bank' }, { status: 400 });
    }
    if (payoutMethod === 'upi' && !body.upi_id?.trim()) {
      return NextResponse.json({ error: 'upi_id required for upi' }, { status: 400 });
    }

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { count } = await db
      .from('merchant_store_bank_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeInternalId);
    const isFirst = (count ?? 0) === 0;

    const insert: Record<string, unknown> = {
      store_id: storeInternalId,
      payout_method: payoutMethod,
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      ifsc_code: payoutMethod === 'bank' ? ifscCode : 'N/A',
      bank_name: payoutMethod === 'bank' ? bankName : 'UPI',
      branch_name: body.branch_name?.trim() || null,
      account_type: body.account_type?.trim() || null,
      is_primary: isFirst,
      is_active: true,
      is_disabled: false,
      bank_proof_type: body.bank_proof_type?.trim() || null,
      bank_proof_file_url: body.bank_proof_file_url?.trim() || null,
      upi_qr_screenshot_url: body.upi_qr_screenshot_url?.trim() || null,
      upi_id: payoutMethod === 'upi' ? body.upi_id?.trim() : null,
      verification_status: 'pending',
    };

    const { data: row, error } = await db
      .from('merchant_store_bank_accounts')
      .insert(insert)
      .select('id, account_holder_name, is_primary, payout_method, created_at')
      .single();

    if (error) {
      console.error('[merchant/bank-accounts POST]', error);
      return NextResponse.json({ error: error.message || 'Failed to add bank account' }, { status: 500 });
    }

    const actor = await getAuditActor();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    await logMerchantAudit(db, {
      entity_type: 'STORE',
      entity_id: storeInternalId,
      action: 'CREATE',
      action_field: 'BANK_ACCOUNT_ADD',
      new_value: {
        bank_account_id: (row as { id: number }).id,
        payout_method: payoutMethod,
        account_holder_name: accountHolderName,
        is_primary: isFirst,
      },
      ...actor,
      ip_address: ip,
      user_agent: ua,
      audit_metadata: { description: 'Bank/UPI account added' },
    });

    return NextResponse.json({ success: true, account: row });
  } catch (e) {
    console.error('[merchant/bank-accounts POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
