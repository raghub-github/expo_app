import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getAreaManagerRecordIdForAuthUser, getMerchantStoreById } from '@/lib/merchant/get-merchant-store';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Stored under merchant_store_settings.settings_metadata */
export const PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY = 'platform_food_alert_sound_slot';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type OrderAcceptanceSettings = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  /** Slots 1–3 from platform (nullable holes allowed). */
  alert_sound_urls_by_slot: [string | null, string | null, string | null];
  /** 0-based slot index (0 = Sound 1 / alert_sound_url). Merchant preference when multiple sounds exist. */
  alert_sound_slot_choice: number;
};

const DEFAULTS: Omit<OrderAcceptanceSettings, 'store_type'> = {
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

function trimUrl(v: unknown): string | null {
  if (v == null || typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function slotsFromPlatformRow(row: Record<string, unknown> | null | undefined): [string | null, string | null, string | null] {
  if (!row) return [null, null, null];
  return [
    trimUrl(row.alert_sound_url),
    trimUrl(row.alert_sound_url_2),
    trimUrl(row.alert_sound_url_3),
  ];
}

function resolveEffectiveUrl(slots: [string | null, string | null, string | null], choice: number): string | null {
  const c = Math.max(0, Math.min(2, Math.floor(choice)));
  const picked = slots[c];
  if (picked) return picked;
  for (let i = 0; i < 3; i++) {
    const u = slots[i];
    if (u) return u;
  }
  return null;
}

function parseStoredSlot(meta: Record<string, unknown> | null | undefined): number {
  const raw = meta?.[PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 2) return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 2) return n;
  }
  return 0;
}

function normalizeChoiceForSlots(
  choice: number,
  slots: [string | null, string | null, string | null]
): number {
  const c = Math.max(0, Math.min(2, Math.floor(choice)));
  if (slots[c]) return c;
  for (let i = 0; i < 3; i++) {
    if (slots[i]) return i;
  }
  return 0;
}

/**
 * GET /api/merchant/order-acceptance-settings?store_id=...
 * Returns FOOD acceptance + sound settings resolved by store_type.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = (searchParams.get('store_id') || '').trim();
    if (!storeId) return NextResponse.json({ error: 'store_id is required' }, { status: 400 });

    const db = getSupabase();
    const { data: storeRow } = await db
      .from('merchant_stores')
      .select('store_type, id')
      .eq('store_id', storeId)
      .maybeSingle();
    const storeType = String((storeRow as { store_type?: string } | null)?.store_type ?? 'GENERAL').toUpperCase();
    const internalId = (storeRow as { id?: number } | null)?.id ?? null;

    let storedChoice = 0;
    if (internalId != null) {
      const { data: sett } = await db
        .from('merchant_store_settings')
        .select('settings_metadata')
        .eq('store_id', internalId)
        .maybeSingle();
      const meta = sett?.settings_metadata as Record<string, unknown> | undefined;
      storedChoice = parseStoredSlot(meta);
    }

    const pickPlatformRow = async (stype: string) => {
      const { data, error } = await db
        .from('platform_food_acceptance_settings_by_store_type')
        .select(
          'store_type,acceptance_window_minutes,alert_sound_enabled,alert_sound_url,alert_sound_url_2,alert_sound_url_3,alert_sound_repeat_count'
        )
        .eq('store_type', stype)
        .maybeSingle();
      return { data, error };
    };

    let { data, error } = await pickPlatformRow(storeType);

    if (error) {
      console.error('[order-acceptance-settings GET] db error', error);
      return NextResponse.json({
        settings: { store_type: storeType, ...DEFAULTS } satisfies OrderAcceptanceSettings,
      });
    }

    if (!data) {
      const { data: g } = await pickPlatformRow('GENERAL');
      data = g ?? null;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const slots = slotsFromPlatformRow(row);
    const choice = normalizeChoiceForSlots(storedChoice, slots);
    const effectiveUrl = resolveEffectiveUrl(slots, choice);

    return NextResponse.json({
      settings: {
        store_type: storeType,
        acceptance_window_minutes: Number(row.acceptance_window_minutes ?? DEFAULTS.acceptance_window_minutes),
        alert_sound_enabled: row.alert_sound_enabled !== false,
        alert_sound_url: effectiveUrl,
        alert_sound_repeat_count: Number(row.alert_sound_repeat_count ?? DEFAULTS.alert_sound_repeat_count),
        alert_sound_urls_by_slot: slots,
        alert_sound_slot_choice: choice,
      } satisfies OrderAcceptanceSettings,
    });
  } catch (e) {
    console.error('[order-acceptance-settings GET] error', e);
    return NextResponse.json({ settings: { store_type: 'GENERAL', ...DEFAULTS } });
  }
}

/**
 * PATCH /api/merchant/order-acceptance-settings
 * Body: { store_id: string, platform_food_alert_sound_slot: 0 | 1 | 2 }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    const db = getSupabase();
    const merchantParentId =
      validation.isValid && validation.merchantParentId != null ? validation.merchantParentId : null;
    const areaManagerId = await getAreaManagerRecordIdForAuthUser(db, user.email);

    if (merchantParentId == null && areaManagerId == null) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant dashboard access required.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const storeId = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const slotRaw = body.platform_food_alert_sound_slot;
    const slot =
      typeof slotRaw === 'number'
        ? slotRaw
        : typeof slotRaw === 'string'
          ? parseInt(slotRaw, 10)
          : NaN;

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
      return NextResponse.json({ error: 'platform_food_alert_sound_slot must be 0, 1, or 2' }, { status: 400 });
    }

    const accessStore = await getMerchantStoreById(db, storeId, { merchantParentId, areaManagerId });
    if (!accessStore) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const internalId = accessStore.id;

    const { data: stRow } = await db.from('merchant_stores').select('store_type').eq('store_id', storeId).maybeSingle();
    const storeType = String((stRow as { store_type?: string } | null)?.store_type ?? 'GENERAL').toUpperCase();

    const { data: plat } = await db
      .from('platform_food_acceptance_settings_by_store_type')
      .select('alert_sound_url,alert_sound_url_2,alert_sound_url_3')
      .eq('store_type', storeType)
      .maybeSingle();

    const platGeneral =
      !plat || (!plat.alert_sound_url && !plat.alert_sound_url_2 && !plat.alert_sound_url_3)
        ? (
            await db
              .from('platform_food_acceptance_settings_by_store_type')
              .select('alert_sound_url,alert_sound_url_2,alert_sound_url_3')
              .eq('store_type', 'GENERAL')
              .maybeSingle()
          ).data
        : null;

    const effectivePlat = (plat ?? platGeneral ?? {}) as Record<string, unknown>;
    const slots = slotsFromPlatformRow(effectivePlat);

    if (!slots[slot]) {
      return NextResponse.json(
        { error: 'That notification sound slot is empty for your store type. Pick another or ask admin to upload.' },
        { status: 400 }
      );
    }

    const { data: existing } = await db
      .from('merchant_store_settings')
      .select('id, settings_metadata')
      .eq('store_id', internalId)
      .maybeSingle();

    const currentMeta = (existing?.settings_metadata && typeof existing.settings_metadata === 'object'
      ? (existing.settings_metadata as Record<string, unknown>)
      : {}) ?? {};

    const nextMeta = {
      ...currentMeta,
      [PLATFORM_FOOD_ALERT_SOUND_SLOT_META_KEY]: slot,
    };

    const payload = {
      store_id: internalId,
      settings_metadata: nextMeta,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id != null) {
      const { error: updateErr } = await db.from('merchant_store_settings').update(payload).eq('store_id', internalId);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    } else {
      const { error: insertErr } = await db.from('merchant_store_settings').insert(payload);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[order-acceptance-settings PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
