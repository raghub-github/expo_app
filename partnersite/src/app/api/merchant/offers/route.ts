/**
 * GET  /api/merchant/offers?storeId=GMMC… — list offers (service role, same merchant_offers table as dashboard)
 * POST /api/merchant/offers — create offer with audit
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAuditActor, logMerchantAudit } from '@/lib/audit-merchant';
import { logStoreActivity } from '@/lib/store-activity-feed';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type StoreRow = {
  id: number;
  parent_id: number | null;
  store_id: string;
  store_name?: string | null;
  store_display_name?: string | null;
};

async function resolveMerchantStore(
  db: SupabaseClient,
  storeIdParam: string,
  merchantParentId: number
): Promise<{ store: StoreRow } | { error: string; status: number }> {
  const trimmed = String(storeIdParam).trim();
  if (!trimmed) {
    return { error: 'storeId is required', status: 400 };
  }

  let storeData: StoreRow | null = null;

  const { data: byCode, error: byCodeErr } = await db
    .from('merchant_stores')
    .select('id, parent_id, store_id, store_name, store_display_name')
    .eq('store_id', trimmed)
    .maybeSingle();

  if (!byCodeErr && byCode) {
    storeData = byCode as StoreRow;
  }

  if (!storeData && /^\d+$/.test(trimmed)) {
    const { data: byPk, error: byPkErr } = await db
      .from('merchant_stores')
      .select('id, parent_id, store_id, store_name, store_display_name')
      .eq('id', parseInt(trimmed, 10))
      .maybeSingle();
    if (!byPkErr && byPk) {
      storeData = byPk as StoreRow;
    }
  }

  if (!storeData) {
    return { error: 'Store not found', status: 404 };
  }
  if (storeData.parent_id !== merchantParentId) {
    return { error: 'Store not accessible', status: 403 };
  }
  return { store: storeData };
}

function shapeTimeColumn(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function shapeOfferRow(row: Record<string, unknown>) {
  const meta = (row.offer_metadata as Record<string, unknown>) || {};
  return {
    ...row,
    menu_item_ids: (meta.menu_item_ids as string[]) ?? null,
    image_url: row.offer_image_url ?? row.image_url ?? null,
    applicable_time_start: shapeTimeColumn(row.applicable_time_start),
    applicable_time_end: shapeTimeColumn(row.applicable_time_end),
    applicable_on_days: Array.isArray(row.applicable_on_days) ? row.applicable_on_days : null,
    valid_from:
      row.valid_from != null ? new Date(row.valid_from as string).toISOString() : row.valid_from,
    valid_till:
      row.valid_till != null ? new Date(row.valid_till as string).toISOString() : row.valid_till,
    created_at:
      row.created_at != null ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
    updated_at:
      row.updated_at != null
        ? new Date(row.updated_at as string).toISOString()
        : row.created_at != null
          ? new Date(row.created_at as string).toISOString()
          : new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeIdParam = searchParams.get('storeId') ?? searchParams.get('store_id');
    if (!storeIdParam) {
      return NextResponse.json({ error: 'storeId query param required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
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
    const resolved = await resolveMerchantStore(db, storeIdParam, validation.merchantParentId);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { data, error } = await db
      .from('merchant_offers')
      .select('*')
      .eq('store_id', resolved.store.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[merchant/offers] GET failed:', error);
      return NextResponse.json({ error: error.message || 'Failed to load offers' }, { status: 500 });
    }

    const offers = (data ?? []).map((row) => shapeOfferRow(row as Record<string, unknown>));

    return NextResponse.json({
      success: true,
      offers,
      store_name: resolved.store.store_display_name ?? resolved.store.store_name ?? null,
      store_id: resolved.store.store_id,
    });
  } catch (e) {
    console.error('[merchant/offers] GET', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
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
    const resolved = await resolveMerchantStore(db, String(storeIdParam), validation.merchantParentId);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const storeData = resolved.store;
    const merchantStoreId = storeData.id;
    const parentId = storeData.parent_id;
    const storeId = storeData.store_id;

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
      // Ownership tracking
      created_source_platform: 'MERCHANT_PORTAL',
      created_by_role: 'MERCHANT',
      approval_status: 'AUTO_APPROVED',
      created_by_user_id: actor.performed_by_id ?? null,
      created_by_org_id: parentId ?? null,
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

    await logStoreActivity({
      storeId: merchantStoreId, section: 'offer', action: 'create',
      entityId: data.id, entityName: data.offer_title,
      summary: `Merchant created offer "${data.offer_title}" (${data.offer_type})`,
      actorName: actor.performed_by_name, actorEmail: actor.performed_by_email,
    });

    return NextResponse.json(response);
  } catch (e) {
    console.error('[merchant/offers] POST', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
