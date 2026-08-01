import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { logStoreActivity } from '@/lib/store-activity-feed';

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

    const payoutMethod = String(body.payout_method || 'bank').toLowerCase().trim();
    if (payoutMethod === 'upi') {
      return NextResponse.json(
        { error: 'Adding UPI is temporarily disabled. Please add a bank account.' },
        { status: 400 },
      );
    }
    if (payoutMethod !== 'bank') {
      return NextResponse.json({ error: 'payout_method must be bank' }, { status: 400 });
    }

    const rawHolder = (body.account_holder_name ?? '').trim();
    const rawAccount = (body.account_number ?? '').trim();
    const ifscCode = body.ifsc_code ? String(body.ifsc_code).trim() : '';
    const bankName = body.bank_name ? String(body.bank_name).trim() : '';

    // Bank only on partnersite / merchant self-serve (UPI remains on admin portal).
    if (!rawHolder || !rawAccount) {
      return NextResponse.json(
        { error: 'account_holder_name and account_number are required for bank' },
        { status: 400 },
      );
    }
    if (!ifscCode || !bankName) {
      return NextResponse.json(
        { error: 'ifsc_code and bank_name required for bank' },
        { status: 400 },
      );
    }

    const upiId = '';
    const accountHolderName = rawHolder || null;
    const accountNumber = rawAccount || null;

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId.trim());
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // One row per store: see AM dashboard semantics. Try to update existing primary row; otherwise insert first.
    const { data: existingRows, error: existingErr } = await db
      .from('merchant_store_bank_accounts')
      .select('id')
      .eq('store_id', storeInternalId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    if (existingErr) {
      console.error('[merchant/bank-accounts POST] existing lookup', existingErr);
      return NextResponse.json({ error: 'Failed to resolve existing bank account' }, { status: 500 });
    }

    const basePayload: Record<string, unknown> = {
      account_holder_name: accountHolderName,
      branch_name: body.branch_name?.trim() || null,
      account_type: body.account_type?.trim() || null,
      payout_method: payoutMethod,
      bank_proof_type: body.bank_proof_type?.trim() || null,
      bank_proof_file_url: body.bank_proof_file_url?.trim() || null,
      upi_qr_screenshot_url: body.upi_qr_screenshot_url?.trim() || null,
      verification_status: 'pending',
    };

    if (payoutMethod === 'bank') {
      basePayload.account_number = accountNumber;
      basePayload.ifsc_code = ifscCode;
      basePayload.bank_name = bankName;
      basePayload.upi_id = null;
    } else {
      basePayload.account_number = accountNumber;
      basePayload.ifsc_code = ifscCode || null;
      basePayload.bank_name = bankName || null;
      basePayload.upi_id = upiId || null;
    }

    let row: { id: number; account_holder_name: string | null; is_primary: boolean | null; payout_method: string | null; created_at: string | Date | null } | null =
      null;

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      // Update existing row so bank + UPI live in the same record
      const existingId = (existingRows[0] as { id: number }).id;
      const { data, error } = await db
        .from('merchant_store_bank_accounts')
        .update(basePayload)
        .eq('id', existingId)
        .select('id, account_holder_name, is_primary, payout_method, created_at')
        .single();

      if (error) {
        console.error('[merchant/bank-accounts POST] update', error);
        return NextResponse.json({ error: error.message || 'Failed to update bank account' }, { status: 500 });
      }
      row = data as any;
    } else {
      // No existing account – insert first row for this store
      const insertPayload: Record<string, unknown> = {
        ...basePayload,
        store_id: storeInternalId,
        is_primary: true,
        is_active: true,
        is_disabled: false,
      };

      const { data, error } = await db
        .from('merchant_store_bank_accounts')
        .insert(insertPayload)
        .select('id, account_holder_name, is_primary, payout_method, created_at')
        .single();

      if (error) {
        console.error('[merchant/bank-accounts POST] insert', error);
        return NextResponse.json({ error: error.message || 'Failed to add bank account' }, { status: 500 });
      }
      row = data as any;
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
        is_primary: (row as any).is_primary ?? true,
      },
      ...actor,
      ip_address: ip,
      user_agent: ua,
      audit_metadata: { description: 'Bank/UPI account added' },
    });

    await logStoreActivity({
      storeId: storeInternalId, section: 'bank_account', action: 'create',
      entityId: (row as any)?.id ?? null, entityName: accountHolderName,
      summary: `Merchant added ${payoutMethod} account "${accountHolderName}"`,
      actorName: actor.performed_by_name, actorEmail: actor.performed_by_email,
    });

    return NextResponse.json({ success: true, account: row });
  } catch (e) {
    console.error('[merchant/bank-accounts POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
