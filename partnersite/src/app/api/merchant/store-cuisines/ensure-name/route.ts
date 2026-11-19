import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { ensureCuisineLinkedByName } from '@/lib/cuisines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** POST { storeId: string (public code), name: string } — create/link cuisine even if not in catalog */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeCode = typeof body.storeId === 'string' ? body.storeId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!storeCode || !name) {
      return NextResponse.json({ error: 'storeId and name required' }, { status: 400 });
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
      const linkedNames = await db
        .from('merchant_store_cuisines')
        .select('custom_name, cuisine_master(name)')
        .eq('store_id', store.id);
      const already =
        Array.isArray(linkedNames.data) &&
        linkedNames.data.some((row) => {
          const custom =
            typeof row.custom_name === 'string' ? row.custom_name.trim() : '';
          // Supabase join typing may be object or array depending on relation cardinality.
          const master = row.cuisine_master;
          const masterRow = Array.isArray(master) ? master[0] : master;
          const masterName =
            masterRow && typeof masterRow === 'object' && typeof masterRow.name === 'string'
              ? masterRow.name
              : '';
          const n = custom || masterName;
          return typeof n === 'string' && n.toLowerCase() === name.toLowerCase();
        });
      if (!already) {
        return NextResponse.json(
          { error: 'custom_cuisine_limit_exceeded', message: `Cuisine limit reached (${maxCuisines})` },
          { status: 400 }
        );
      }
    }

    const ensured = await ensureCuisineLinkedByName(store.id as number, name);

    const prev = Array.isArray(store.cuisine_types)
      ? store.cuisine_types.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    if (!prev.some((p) => p.toLowerCase() === name.toLowerCase())) {
      await db
        .from('merchant_stores')
        .update({ cuisine_types: [...prev, name] })
        .eq('id', store.id);
    }

    return NextResponse.json({ success: true, id: ensured.id, created: ensured.createdMaster });
  } catch (e) {
    console.error('[store-cuisines/ensure-name]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
