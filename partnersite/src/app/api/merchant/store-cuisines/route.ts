import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import {
  getCuisinesForStore,
  getLinkedCuisinesDetailed,
  getCatalogCuisinesNotLinked,
  syncLegacyCuisineTypesFromMerchantStore,
  upsertStoreCuisines,
} from '@/lib/cuisines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET /api/merchant/store-cuisines?storeId=GMMC1015
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeCode = searchParams.get('storeId');
    if (!storeCode) {
      return NextResponse.json({ error: 'storeId query param required' }, { status: 400 });
    }

    const access = await assertStoreAccess(storeCode);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const storePk = access.storeIdNum;
    await syncLegacyCuisineTypesFromMerchantStore(storePk);
    const cuisines = await getCuisinesForStore(storePk);
    const detailed = await getLinkedCuisinesDetailed(storePk);
    const catalog = await getCatalogCuisinesNotLinked(storePk);
    return NextResponse.json({ cuisines, cuisineDetails: detailed, catalog });
  } catch (e) {
    console.error('[store-cuisines GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/merchant/store-cuisines
// Body: { storeId: 'GMMC1015', cuisines: string[] }  (replaces full set for store)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeCode: string | undefined = body.storeId;
    const cuisinesInput: unknown = body.cuisines;

    if (!storeCode || !Array.isArray(cuisinesInput)) {
      return NextResponse.json({ error: 'storeId and cuisines[] are required' }, { status: 400 });
    }

    const access = await assertStoreAccess(storeCode);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const cuisineNames = (cuisinesInput as unknown[])
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const db = getSupabaseAdmin();
    await upsertStoreCuisines(access.storeIdNum, cuisineNames);

    // Keep merchant_stores.cuisine_types in sync as an array of strings for existing UI
    await db
      .from('merchant_stores')
      .update({ cuisine_types: cuisineNames })
      .eq('id', access.storeIdNum);

    const finalCuisines = await getCuisinesForStore(access.storeIdNum);
    return NextResponse.json({ cuisines: finalCuisines });
  } catch (e) {
    console.error('[store-cuisines POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
