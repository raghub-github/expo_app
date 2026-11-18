import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** POST { storeId: string, cuisine_id: number } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeCode = typeof body.storeId === 'string' ? body.storeId.trim() : '';
    const cuisineId = typeof body.cuisine_id === 'number' ? body.cuisine_id : Number(body.cuisine_id);
    if (!storeCode || !Number.isFinite(cuisineId) || cuisineId <= 0) {
      return NextResponse.json({ error: 'storeId and cuisine_id required' }, { status: 400 });
    }

    const access = await assertStoreAccess(storeCode);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const db = getSupabaseAdmin();
    const { data: store, error: se } = await db
      .from('merchant_stores')
      .select('id, parent_id, cuisine_types')
      .eq('id', access.storeIdNum)
      .single();
    if (se || !store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { count: catCount, error: catErr } = await db
      .from('merchant_menu_categories')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('cuisine_id', cuisineId)
      .or('is_deleted.is.null,is_deleted.eq.false');
    if (catErr) {
      return NextResponse.json({ error: 'Check failed' }, { status: 500 });
    }
    if ((catCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'cuisine_in_use',
          message: 'Remove or reassign categories that use this cuisine first.',
        },
        { status: 400 }
      );
    }

    const { data: cm } = await db.from('cuisine_master').select('name').eq('id', cuisineId).maybeSingle();

    await db.from('merchant_store_cuisines').delete().eq('store_id', store.id).eq('cuisine_id', cuisineId);

    const prev = Array.isArray(store.cuisine_types)
      ? store.cuisine_types.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    const dropName = String(cm?.name || '').trim().toLowerCase();
    const nextTypes = dropName
      ? prev.filter((p) => p.trim().toLowerCase() !== dropName)
      : prev;
    await db.from('merchant_stores').update({ cuisine_types: nextTypes }).eq('id', store.id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[store-cuisines/unlink]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
