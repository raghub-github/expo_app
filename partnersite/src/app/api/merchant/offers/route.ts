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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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

/**
 * Old rows have absolute dev URLs baked in (`http://localhost:3000/api/attachments/proxy?...`)
 * from when uploads ran on a dev host. On production those trigger mixed-content warnings and
 * fail to load. Strip the absolute prefix so the browser fetches via the same origin.
 */
function relativizeProxyUrl(v: unknown): unknown {
  if (typeof v !== 'string' || !v) return v;
  const m = v.match(/^https?:\/\/[^/]+(\/(?:api|v1)\/attachments\/proxy[^\s]*)$/i);
  return m ? m[1] : v;
}

function shapeOfferRow(
  row: Record<string, unknown>,
  applicabilityIds?: string[] | null,
  itemIdByPk?: Map<number, string>
) {
  const meta = (row.offer_metadata as Record<string, unknown>) || {};
  const fromMeta = Array.isArray(meta.menu_item_ids)
    ? (meta.menu_item_ids as unknown[]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  const fromApp = Array.isArray(applicabilityIds)
    ? applicabilityIds.map((v) => String(v).trim()).filter(Boolean)
    : [];
  const mergedIds = canonicalizeOfferMenuItemIds([...fromMeta, ...fromApp], itemIdByPk);
  const rawImageUrl = row.offer_image_url ?? row.image_url ?? null;
  return {
    ...row,
    menu_item_ids: mergedIds.length > 0 ? mergedIds : null,
    offer_metadata: {
      ...meta,
      ...(mergedIds.length > 0 ? { menu_item_ids: mergedIds } : { menu_item_ids: [] }),
    },
    image_url: relativizeProxyUrl(rawImageUrl) as string | null,
    offer_image_url: relativizeProxyUrl(row.offer_image_url) as string | null,
    applicable_time_start: shapeTimeColumn(row.applicable_time_start),
    applicable_time_end: shapeTimeColumn(row.applicable_time_end),
    applicable_on_days: Array.isArray(row.applicable_on_days) ? row.applicable_on_days : null,
    valid_from:
      row.valid_from != null ? new Date(row.valid_from as string).toISOString() : row.valid_from,
    valid_till:
      row.valid_till != null ? new Date(row.valid_till as string).toISOString() : row.valid_till,
    lifecycle_status: row.lifecycle_status ?? 'ACTIVE',
    published_at: row.published_at ?? null,
    disabled_at: row.disabled_at ?? null,
    disabled_reason: row.disabled_reason ?? null,
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

/** Prefer catalog `item_id`; map numeric PKs → item_id; never count PK+item_id as two. */
function canonicalizeOfferMenuItemIds(
  ids: string[],
  itemIdByPk?: Map<number, string>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    let canon = s;
    if (itemIdByPk && /^\d+$/.test(s)) {
      const mapped = itemIdByPk.get(Number(s));
      if (mapped) canon = mapped;
    }
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
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

    const rows = (data ?? []) as Record<string, unknown>[];
    const offerPks = rows
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const idsByOfferPk = new Map<number, string[]>();
    // Full store map so metadata numeric PKs can be resolved to catalog item_id.
    const itemIdByPk = new Map<number, string>();
    const { data: storeMenuRows } = await db
      .from('merchant_menu_items')
      .select('id, item_id')
      .eq('store_id', resolved.store.id);
    for (const m of storeMenuRows ?? []) {
      const row = m as { id: number; item_id?: string | null };
      if (row.item_id) itemIdByPk.set(Number(row.id), String(row.item_id).trim());
    }

    if (offerPks.length > 0) {
      const { data: appRows } = await db
        .from('merchant_offer_applicability')
        .select('offer_id, menu_item_id')
        .in('offer_id', offerPks)
        .not('menu_item_id', 'is', null);

      for (const row of appRows ?? []) {
        const r = row as { offer_id: number; menu_item_id: number };
        const oid = Number(r.offer_id);
        const mid = Number(r.menu_item_id);
        if (!Number.isFinite(oid) || !Number.isFinite(mid)) continue;
        const publicId = itemIdByPk.get(mid);
        if (!publicId) continue;
        const list = idsByOfferPk.get(oid) ?? [];
        list.push(publicId);
        idsByOfferPk.set(oid, list);
      }
    }

    const offers = rows.map((row) =>
      shapeOfferRow(row, idsByOfferPk.get(Number(row.id)) ?? null, itemIdByPk)
    );

    try {
      const { client: sql } = await import('@/lib/drizzle');
      const {
        loadMerchantOfferTrackStats,
        mergeOfferTrackStatsIntoMetadata,
      } = await import('@/lib/merchant-offer-track-stats');
      const stats = await loadMerchantOfferTrackStats(sql as never, resolved.store.id, offerPks);
      for (const offer of offers as Array<Record<string, unknown>>) {
        const pk = Number(offer.id);
        const stat = stats.get(pk);
        if (!stat) continue;
        const meta = (offer.offer_metadata as Record<string, unknown>) ?? {};
        offer.offer_metadata = mergeOfferTrackStatsIntoMetadata(
          meta,
          stat,
          offer.current_uses as number | null | undefined,
        );
      }
    } catch (e) {
      console.warn('[merchant/offers] track stats enrichment failed', e);
    }

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
    const publishMode = String(body.publish_mode ?? 'publish').toLowerCase();
    const isDraft = publishMode === 'draft' || body.lifecycle_status === 'DRAFT';
    const now = new Date();
    const validFrom = body.valid_from ? new Date(body.valid_from) : now;
    const validTill = body.valid_till ? new Date(body.valid_till) : now;

    let lifecycleStatus = 'ACTIVE';
    let isActive = true;
    let publishedAt: string | null = now.toISOString();

    if (isDraft) {
      lifecycleStatus = 'DRAFT';
      isActive = false;
      publishedAt = null;
    } else if (validTill < now) {
      lifecycleStatus = 'EXPIRED';
      isActive = false;
    } else if (validFrom > now) {
      lifecycleStatus = 'SCHEDULED';
      isActive = true;
    }

    // merchant_offers has no menu_item_ids column; store in offer_metadata
    const baseMetadata = (body.offer_metadata && typeof body.offer_metadata === 'object') ? { ...body.offer_metadata } : {};
    if (body.menu_item_ids != null && Array.isArray(body.menu_item_ids)) {
      (baseMetadata as Record<string, unknown>).menu_item_ids = body.menu_item_ids;
    } else if (
      Array.isArray((baseMetadata as Record<string, unknown>).menu_item_ids) === false &&
      body.menu_item_ids === null
    ) {
      (baseMetadata as Record<string, unknown>).menu_item_ids = [];
    }
    if (Array.isArray(body.category_ids) && body.category_ids.length > 0) {
      (baseMetadata as Record<string, unknown>).category_ids = body.category_ids;
    }

    const offerType = String(body.offer_type || 'PERCENTAGE');
    const isBogo = offerType === 'BUY_X_GET_Y' || offerType === 'BUY_N_GET_M' || offerType === 'BOGO';

    // Persist Boost vs Precision exactly as the merchant selected (do not override).
    // BOGO is identified by offer_type — do not stamp conditions_mode.
    if (isBogo) {
      delete (baseMetadata as Record<string, unknown>).conditions_mode;
      (baseMetadata as Record<string, unknown>).create_path = 'bogo';
    } else {
      const modeRaw = String((baseMetadata as Record<string, unknown>).conditions_mode ?? '')
        .toLowerCase()
        .trim();
      if (modeRaw === 'boost' || modeRaw === 'precision') {
        (baseMetadata as Record<string, unknown>).conditions_mode = modeRaw;
        if (!(baseMetadata as Record<string, unknown>).create_path) {
          (baseMetadata as Record<string, unknown>).create_path = modeRaw;
        }
      }
      if (modeRaw === 'precision') {
        (baseMetadata as Record<string, unknown>).menu_item_ids = [];
        body.offer_sub_type = 'ALL_ORDERS';
      }
    }

    const toNumOrNull = (v: unknown) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const payload: Record<string, unknown> = {
      store_id: merchantStoreId,
      offer_id: offerId,
      offer_title: body.offer_title,
      offer_description: body.offer_description ?? null,
      offer_type: offerType,
      offer_sub_type: body.offer_sub_type ?? null,
      discount_value: toNumOrNull(body.discount_value),
      discount_percentage: toNumOrNull(body.discount_percentage),
      max_discount_amount: toNumOrNull(body.max_discount_amount),
      min_order_amount: toNumOrNull(body.min_order_amount),
      max_order_amount: toNumOrNull(body.max_order_amount),
      min_items: toNumOrNull(body.min_items),
      buy_quantity: isBogo ? (toNumOrNull(body.buy_quantity) ?? 1) : toNumOrNull(body.buy_quantity),
      get_quantity: isBogo ? (toNumOrNull(body.get_quantity) ?? 1) : toNumOrNull(body.get_quantity),
      coupon_code: body.coupon_code ?? null,
      offer_image_url: body.offer_image_url ?? body.image_url ?? null,
      valid_from: body.valid_from,
      valid_till: body.valid_till,
      is_active: body.is_active ?? isActive,
      lifecycle_status: body.lifecycle_status ?? lifecycleStatus,
      published_at: publishedAt,
      auto_apply: body.auto_apply ?? true,
      is_stackable: body.is_stackable ?? false,
      priority: toNumOrNull(body.priority) ?? 0,
      per_order_limit: toNumOrNull(body.per_order_limit) ?? 1,
      first_order_only: body.first_order_only ?? false,
      new_user_only: body.new_user_only ?? false,
      user_segment: body.user_segment ?? {},
      max_discount_per_order: toNumOrNull(body.max_discount_per_order),
      usage_reset_period: body.usage_reset_period ?? null,
      max_uses_total: toNumOrNull(body.max_uses_total),
      max_uses_per_user: toNumOrNull(body.max_uses_per_user),
      applicable_on_days: body.applicable_on_days ?? null,
      applicable_time_start: shapeTimeColumn(body.applicable_time_start),
      applicable_time_end: shapeTimeColumn(body.applicable_time_end),
      offer_metadata: Object.keys(baseMetadata).length ? baseMetadata : {},
      created_by_name: actor.performed_by_name,
      // Ownership tracking
      created_source_platform: 'MERCHANT_PORTAL',
      created_by_role: 'MERCHANT',
      approval_status: 'AUTO_APPROVED',
      created_by_user_id: actor.performed_by_id ?? null,
      created_by_org_id: parentId ?? null,
    };

    if (!payload.offer_title || !payload.valid_from || !payload.valid_till) {
      return NextResponse.json(
        { error: 'offer_title, valid_from and valid_till are required' },
        { status: 400 }
      );
    }

    const { data, error } = await db
      .from('merchant_offers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('[merchant/offers] create failed:', error);
      return NextResponse.json({ error: error.message || 'Failed to create offer' }, { status: 500 });
    }

    try {
      await db.rpc('sync_offer_applicability_from_metadata', { p_offer_id: data.id });
    } catch (syncErr) {
      console.warn('[merchant/offers] create sync applicability failed', syncErr);
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

    if (!isDraft) {
      void fetch(
        `${process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000'}/v1/internal/offers/invalidate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.BACKEND_SCHEDULE_TICK_SECRET || '',
          },
          body: JSON.stringify({
            storeId: merchantStoreId,
            offerId: data.id,
            event: 'offer_published',
          }),
        }
      ).catch(() => {});
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error('[merchant/offers] POST', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
