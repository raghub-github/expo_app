import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
};

const DEFAULTS: Omit<OrderAcceptanceSettings, "store_type"> = {
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
};

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
      .select('store_type')
      .eq('store_id', storeId)
      .maybeSingle();
    const storeType = String((storeRow as { store_type?: string } | null)?.store_type ?? 'GENERAL').toUpperCase();

    const { data, error } = await db
      .from('platform_food_acceptance_settings_by_store_type')
      .select('store_type,acceptance_window_minutes,alert_sound_enabled,alert_sound_url,alert_sound_repeat_count')
      .eq('store_type', storeType)
      .maybeSingle();

    if (error) {
      console.error('[order-acceptance-settings GET] db error', error);
      return NextResponse.json({ settings: { store_type: storeType, ...DEFAULTS } });
    }

    if (data) {
      return NextResponse.json({ settings: { ...DEFAULTS, ...(data as any) } });
    }

    // Fallback to GENERAL row if store type wasn't seeded
    const { data: g } = await db
      .from('platform_food_acceptance_settings_by_store_type')
      .select('store_type,acceptance_window_minutes,alert_sound_enabled,alert_sound_url,alert_sound_repeat_count')
      .eq('store_type', 'GENERAL')
      .maybeSingle();
    return NextResponse.json({ settings: { store_type: storeType, ...DEFAULTS, ...(g ?? {}) } });
  } catch (e) {
    console.error('[order-acceptance-settings GET] error', e);
    return NextResponse.json({ settings: { store_type: 'GENERAL', ...DEFAULTS } });
  }
}

