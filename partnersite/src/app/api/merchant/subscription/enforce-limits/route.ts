import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/subscription/enforce-limits
 *
 * Triggers:
 *   ?storeId=GMMC1015          — enforce for one store (merchant-authenticated)
 *   ?storeId=GMMC1015&cron=1   — enforce for one store (cron/internal, requires CRON_SECRET header)
 *   ?all=1&cron=1              — enforce for ALL stores (nightly cron)
 *
 * Calls the Postgres function enforce_plan_limits(store_id) which is:
 *   - Idempotent
 *   - Non-destructive (never deletes, never touches is_active/in_stock)
 *   - Reversible (unlock_all_plan_locks on upgrade)
 */
export async function POST(req: NextRequest) {
  const db = getDb();
  const isCron = req.nextUrl.searchParams.get('cron') === '1';
  const enforceAll = req.nextUrl.searchParams.get('all') === '1';
  const storeIdParam = req.nextUrl.searchParams.get('storeId');

  // Auth: cron requests use CRON_SECRET header, merchant requests use session
  if (isCron) {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
    if (!cronSecret || headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const supabaseServer = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();
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
  }

  try {
    if (enforceAll && isCron) {
      const { data, error } = await db.rpc('enforce_plan_limits_all_stores');
      if (error) {
        console.error('[enforce-limits] all stores error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, results: data });
    }

    if (!storeIdParam) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const { data: store } = await db
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeIdParam.trim())
      .single();

    if (!store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data, error } = await db.rpc('enforce_plan_limits', { p_store_id: store.id });
    if (error) {
      console.error('[enforce-limits] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: data });
  } catch (e: any) {
    console.error('[enforce-limits] unexpected:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/merchant/subscription/enforce-limits?storeId=GMMC1015
 * Returns plan usage stats for the store (for dashboard display).
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const storeIdParam = req.nextUrl.searchParams.get('storeId');

  if (!storeIdParam) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const supabaseServer = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabaseServer.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { data: store } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeIdParam.trim())
      .single();

    if (!store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get plan limits
    const { data: sub } = await db
      .from('merchant_subscriptions')
      .select('plan_id, merchant_plans(plan_code, plan_name, max_menu_items, max_menu_categories)')
      .eq('merchant_id', store.parent_id)
      .or(`store_id.is.null,store_id.eq.${store.id}`)
      .eq('is_active', true)
      .eq('subscription_status', 'ACTIVE')
      .gt('expiry_date', new Date().toISOString())
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let plan: any = sub?.merchant_plans;
    if (!plan) {
      const { data: freePlan } = await db
        .from('merchant_plans')
        .select('plan_code, plan_name, max_menu_items, max_menu_categories')
        .eq('plan_code', 'FREE')
        .eq('is_active', true)
        .maybeSingle();
      plan = freePlan;
    }

    // Count items
    const { count: totalItems } = await db
      .from('merchant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_deleted', false);

    const { count: lockedItems } = await db
      .from('merchant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_deleted', false)
      .eq('is_locked_by_plan', true);

    const { count: totalCategories } = await db
      .from('merchant_menu_categories')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_deleted', false);

    const { count: lockedCategories } = await db
      .from('merchant_menu_categories')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_deleted', false)
      .eq('is_locked_by_plan', true);

    return NextResponse.json({
      plan: {
        code: plan?.plan_code ?? 'FREE',
        name: plan?.plan_name ?? 'Free Plan',
        maxItems: plan?.max_menu_items ?? 15,
        maxCategories: plan?.max_menu_categories ?? 5,
      },
      usage: {
        totalItems: totalItems ?? 0,
        unlockedItems: (totalItems ?? 0) - (lockedItems ?? 0),
        lockedItems: lockedItems ?? 0,
        totalCategories: totalCategories ?? 0,
        unlockedCategories: (totalCategories ?? 0) - (lockedCategories ?? 0),
        lockedCategories: lockedCategories ?? 0,
      },
    });
  } catch (e: any) {
    console.error('[enforce-limits GET]', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
