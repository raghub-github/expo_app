import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** POST { storeId: string (public code), cuisine_id: number } */
export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error ?? 'Merchant not found' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const storeCode = typeof body.storeId === 'string' ? body.storeId.trim() : '';
    const cuisineId = typeof body.cuisine_id === 'number' ? body.cuisine_id : Number(body.cuisine_id);
    if (!storeCode || !Number.isFinite(cuisineId) || cuisineId <= 0) {
      return NextResponse.json({ error: 'storeId and cuisine_id required' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: store, error: se } = await db
      .from('merchant_stores')
      .select('id, parent_id, cuisine_types')
      .eq('store_id', storeCode)
      .single();
    if (se || !store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if (Number(store.parent_id) !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store does not belong to this merchant' }, { status: 403 });
    }

    const { data: cm, error: ce } = await db
      .from('cuisine_master')
      .select('id, name')
      .eq('id', cuisineId)
      .eq('is_active', true)
      .maybeSingle();
    if (ce || !cm) {
      return NextResponse.json({ error: 'Cuisine not found' }, { status: 404 });
    }

    const { count: linkCount } = await db
      .from('merchant_store_cuisines')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', store.id);

    const { data: subscription } = await db
      .from('merchant_subscriptions')
      .select('*, merchant_plans(*)')
      .eq('merchant_id', store.parent_id)
      .or(`store_id.is.null,store_id.eq.${store.id}`)
      .eq('is_active', true)
      .eq('subscription_status', 'ACTIVE')
      .gt('expiry_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const plan = subscription?.merchant_plans as { max_cuisines?: number | null } | undefined;
    const maxCuisines = plan?.max_cuisines ?? null;
    if (maxCuisines != null && (linkCount ?? 0) >= maxCuisines) {
      return NextResponse.json(
        { error: 'custom_cuisine_limit_exceeded', message: `Cuisine limit reached (${maxCuisines})` },
        { status: 400 }
      );
    }

    const { error: insErr } = await db.from('merchant_store_cuisines').upsert(
      { store_id: store.id, cuisine_id: cuisineId, custom_name: null },
      { onConflict: 'store_id,cuisine_id' }
    );
    if (insErr) {
      console.error('[store-cuisines/link]', insErr);
      return NextResponse.json({ error: 'Failed to link cuisine' }, { status: 500 });
    }

    const prev = Array.isArray(store.cuisine_types)
      ? store.cuisine_types.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    const nameStr = String(cm.name || '').trim();
    if (nameStr && !prev.some((p) => p.toLowerCase() === nameStr.toLowerCase())) {
      await db
        .from('merchant_stores')
        .update({ cuisine_types: [...prev, nameStr] })
        .eq('id', store.id);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[store-cuisines/link]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
