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
 * PATCH /api/merchant/bank-accounts/[id]
 * Body: storeId, set_default?: boolean, set_disabled?: boolean, or edit fields (account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, bank_proof_file_url, upi_qr_screenshot_url, bank_proof_type).
 * - set_default: true -> set this account as default (is_primary=true); others for same store set is_primary=false.
 * - set_disabled: true -> disable account (is_active=false, is_disabled=true). Row is never deleted.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accountId = parseInt(id, 10);
    if (isNaN(accountId)) {
      return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
    }

    const body = await req.json();
    const storeId = body.storeId ?? body.store_id;
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const db = getDb();
    const storeInternalId = await resolveStoreInternalId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: existing, error: fetchErr } = await db
      .from('merchant_store_bank_accounts')
      .select('id, store_id')
      .eq('id', accountId)
      .single();

    if (fetchErr || !existing || (existing.store_id as number) !== storeInternalId) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.set_default === true) {
      updates.is_primary = true;
      updates.is_active = true;
      updates.is_disabled = false;
    }

    if (body.set_disabled === true) {
      updates.is_active = false;
      updates.is_disabled = true;
      updates.is_primary = false;
    }

    if (body.set_disabled === false) {
      updates.is_active = true;
      updates.is_disabled = false;
    }

    if (body.account_holder_name !== undefined) updates.account_holder_name = String(body.account_holder_name).trim();
    if (body.account_number !== undefined) updates.account_number = String(body.account_number).trim();
    if (body.ifsc_code !== undefined) updates.ifsc_code = String(body.ifsc_code).trim();
    if (body.bank_name !== undefined) updates.bank_name = String(body.bank_name).trim();
    if (body.branch_name !== undefined) updates.branch_name = body.branch_name ? String(body.branch_name).trim() : null;
    if (body.account_type !== undefined) updates.account_type = body.account_type ? String(body.account_type).trim() : null;
    if (body.upi_id !== undefined) updates.upi_id = body.upi_id ? String(body.upi_id).trim() : null;
    if (body.bank_proof_type !== undefined) updates.bank_proof_type = body.bank_proof_type ? String(body.bank_proof_type).trim() : null;
    if (body.bank_proof_file_url !== undefined) updates.bank_proof_file_url = body.bank_proof_file_url ? String(body.bank_proof_file_url).trim() : null;
    if (body.upi_qr_screenshot_url !== undefined) updates.upi_qr_screenshot_url = body.upi_qr_screenshot_url ? String(body.upi_qr_screenshot_url).trim() : null;

    const { data: updated, error } = await db
      .from('merchant_store_bank_accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('store_id', storeInternalId)
      .select()
      .single();

    if (error) {
      console.error('[merchant/bank-accounts PATCH]', error);
      return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
    }

    let actionField: string | null = null;
    const newVal: Record<string, unknown> = { bank_account_id: accountId };
    const oldVal: Record<string, unknown> = { bank_account_id: accountId };
    if (body.set_default === true) {
      actionField = 'BANK_ACCOUNT_SET_DEFAULT';
      oldVal.is_primary = false;
      newVal.is_primary = true;
    } else if (body.set_disabled === true) {
      actionField = 'BANK_ACCOUNT_DISABLE';
      oldVal.is_disabled = false;
      newVal.is_disabled = true;
    } else if (body.set_disabled === false) {
      actionField = 'BANK_ACCOUNT_ENABLE';
      oldVal.is_disabled = true;
      newVal.is_disabled = false;
    }
    if (actionField) {
      const actor = await getAuditActor();
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
      const ua = req.headers.get('user-agent') || null;
      const descriptions: Record<string, string> = {
        BANK_ACCOUNT_SET_DEFAULT: 'Bank account set as default',
        BANK_ACCOUNT_DISABLE: 'Bank account disabled',
        BANK_ACCOUNT_ENABLE: 'Bank account enabled',
      };
      await logMerchantAudit(db, {
        entity_type: 'STORE',
        entity_id: storeInternalId,
        action: 'UPDATE',
        action_field: actionField,
        old_value: oldVal,
        new_value: newVal,
        ...actor,
        ip_address: ip,
        user_agent: ua,
        audit_metadata: { description: descriptions[actionField] || actionField },
      });
    }

    return NextResponse.json({ success: true, account: updated });
  } catch (e) {
    console.error('[merchant/bank-accounts PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
