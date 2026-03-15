/**
 * POST /api/merchant/offers
 * Create offer with audit: records created_by_name and logs to merchant_audit_logs.
 */
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

function generateOfferId(storeId: string): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OFF-${storeId}-${t}-${r}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeIdParam = body.store_id ?? body.storeId;
    if (!storeIdParam) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
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
      return NextResponse.json({ error: validation.error ?? 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const storeId = String(storeIdParam).trim();

    const { data: storeData, error: storeErr } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single();
    if (storeErr || !storeData) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    const merchantStoreId = storeData.id as number;
    const parentId = storeData.parent_id as number | null;
    if (parentId !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not accessible' }, { status: 403 });
    }

    const actor = await getAuditActor();
    const offerId = generateOfferId(storeId);

    // merchant_offers has no menu_item_ids column; store in offer_metadata
    const baseMetadata = (body.offer_metadata && typeof body.offer_metadata === 'object') ? { ...body.offer_metadata } : {};
    if (body.menu_item_ids != null && Array.isArray(body.menu_item_ids)) {
      (baseMetadata as Record<string, unknown>).menu_item_ids = body.menu_item_ids;
    }

    const payload: Record<string, unknown> = {
      store_id: merchantStoreId,
      offer_id: offerId,
      offer_title: body.offer_title,
      offer_description: body.offer_description ?? null,
      offer_type: body.offer_type,
      offer_sub_type: body.offer_sub_type ?? null,
      discount_value: body.discount_value ?? null,
      discount_percentage: body.discount_percentage ?? null,
      max_discount_amount: body.max_discount_amount ?? null,
      min_order_amount: body.min_order_amount ?? null,
      max_order_amount: body.max_order_amount ?? null,
      min_items: body.min_items ?? null,
      buy_quantity: body.buy_quantity ?? null,
      get_quantity: body.get_quantity ?? null,
      coupon_code: body.coupon_code ?? null,
      offer_image_url: body.offer_image_url ?? body.image_url ?? null,
      valid_from: body.valid_from,
      valid_till: body.valid_till,
      is_active: body.is_active ?? true,
      auto_apply: body.auto_apply ?? true,
      is_stackable: body.is_stackable ?? false,
      priority: body.priority ?? 0,
      per_order_limit: body.per_order_limit ?? 1,
      first_order_only: body.first_order_only ?? false,
      new_user_only: body.new_user_only ?? false,
      user_segment: body.user_segment ?? null,
      max_discount_per_order: body.max_discount_per_order ?? null,
      usage_reset_period: body.usage_reset_period ?? null,
      max_uses_total: body.max_uses_total ?? null,
      max_uses_per_user: body.max_uses_per_user ?? null,
      applicable_on_days: body.applicable_on_days ?? null,
      applicable_time_start: body.applicable_time_start ?? null,
      applicable_time_end: body.applicable_time_end ?? null,
      offer_metadata: Object.keys(baseMetadata).length ? baseMetadata : null,
      created_by_name: actor.performed_by_name,
    };

    const { data, error } = await db
      .from('merchant_offers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('[merchant/offers] create failed:', error);
      return NextResponse.json({ error: error.message || 'Failed to create offer' }, { status: 500 });
    }

    // Shape response so frontend gets menu_item_ids (stored in offer_metadata; no column on table)
    const meta = (data.offer_metadata as Record<string, unknown>) || {};
    const response = { ...data, menu_item_ids: (meta.menu_item_ids as string[]) ?? null };

    await logMerchantAudit(db, {
      entity_type: 'OFFER',
      entity_id: data.id,
      action: 'CREATE',
      action_field: null,
      old_value: null,
      new_value: { offer_id: data.offer_id, offer_title: data.offer_title, offer_type: data.offer_type },
      performed_by: actor.performed_by,
      performed_by_id: actor.performed_by_id,
      performed_by_name: actor.performed_by_name,
      performed_by_email: actor.performed_by_email,
      audit_metadata: { description: `Offer created: ${data.offer_title}` },
    });

    return NextResponse.json(response);
  } catch (e) {
    console.error('[merchant/offers] POST', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
