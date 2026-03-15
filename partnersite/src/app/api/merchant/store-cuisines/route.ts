import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { getCuisinesForStore, upsertStoreCuisines } from '@/lib/cuisines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET /api/merchant/store-cuisines?storeId=GMMC1015
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const storeCode = searchParams.get('storeId');
    if (!storeCode) {
      return NextResponse.json({ error: 'storeId query param required' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: store, error: storeError } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeCode.trim())
      .single();

    if (storeError || !store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if (store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store does not belong to this merchant' }, { status: 403 });
    }

    const cuisines = await getCuisinesForStore(store.id as number);
    return NextResponse.json({ cuisines });
  } catch (e) {
    console.error('[store-cuisines GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/merchant/store-cuisines
// Body: { storeId: 'GMMC1015', cuisines: string[] }  (replaces full set for store)
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
    const storeCode: string | undefined = body.storeId;
    const cuisinesInput: unknown = body.cuisines;

    if (!storeCode || !Array.isArray(cuisinesInput)) {
      return NextResponse.json({ error: 'storeId and cuisines[] are required' }, { status: 400 });
    }

    const cuisineNames = (cuisinesInput as unknown[])
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const db = getSupabaseAdmin();
    const { data: store, error: storeError } = await db
      .from('merchant_stores')
      .select('id, parent_id, cuisine_types')
      .eq('store_id', storeCode.trim())
      .single();

    if (storeError || !store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if (store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store does not belong to this merchant' }, { status: 403 });
    }

    await upsertStoreCuisines(store.id as number, cuisineNames);

    // Keep merchant_stores.cuisine_types in sync as an array of strings for existing UI
    await db
      .from('merchant_stores')
      .update({ cuisine_types: cuisineNames })
      .eq('id', store.id);

    const finalCuisines = await getCuisinesForStore(store.id as number);
    return NextResponse.json({ cuisines: finalCuisines });
  } catch (e) {
    console.error('[store-cuisines POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

