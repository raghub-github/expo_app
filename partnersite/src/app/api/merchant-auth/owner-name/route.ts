import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireMerchantParentPk(): Promise<
  { ok: true; parentPk: number } | { ok: false; status: number; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: 'Not authenticated' };
  }
  const v = await validateMerchantFromSession({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  });
  if (!v.isValid || v.merchantParentId == null) {
    return { ok: false, status: 403, message: v.error ?? 'Merchant not found' };
  }
  return { ok: true, parentPk: v.merchantParentId };
}

/** PATCH — update merchant_stores.owner_full_name for the active outlet. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireMerchantParentPk();
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      store_id?: unknown;
      owner_full_name?: unknown;
      owner_name?: unknown;
    };
    const storeId = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const ownerFullName =
      (typeof body.owner_full_name === 'string' ? body.owner_full_name.trim() : '') ||
      (typeof body.owner_name === 'string' ? body.owner_name.trim() : '');

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store id is required.' }, { status: 400 });
    }
    if (ownerFullName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Owner name must be at least 2 characters.' },
        { status: 400 },
      );
    }
    if (ownerFullName.length > 120) {
      return NextResponse.json(
        { success: false, error: 'Owner name is too long.' },
        { status: 400 },
      );
    }

    const db = getSupabaseAdmin();
    const { data: storeRow, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, store_id, parent_id')
      .eq('store_id', storeId)
      .eq('parent_id', auth.parentPk)
      .maybeSingle();

    if (storeErr) {
      console.error('[owner-name] store lookup:', storeErr);
      return NextResponse.json({ success: false, error: 'Could not verify store.' }, { status: 500 });
    }
    if (!storeRow) {
      return NextResponse.json({ success: false, error: 'Store not found.' }, { status: 404 });
    }

    const { error: upErr } = await db
      .from('merchant_stores')
      .update({ owner_full_name: ownerFullName, updated_at: new Date().toISOString() })
      .eq('id', storeRow.id);

    if (upErr) {
      console.error('[owner-name] update:', upErr);
      return NextResponse.json({ success: false, error: 'Could not save owner name.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      store_id: storeRow.store_id,
      owner_full_name: ownerFullName,
    });
  } catch (e) {
    console.error('[owner-name] PATCH:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Update failed' },
      { status: 500 },
    );
  }
}
