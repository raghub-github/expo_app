import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * GET /api/merchant/order-line-item-menu?storeId=GMMC1022&menuItemId=123
 * Live menu row for order-history item detail modal.
 */
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

    const storeId = req.nextUrl.searchParams.get('storeId')?.trim();
    const menuItemIdRaw = req.nextUrl.searchParams.get('menuItemId');
    const menuItemId = menuItemIdRaw != null ? parseInt(menuItemIdRaw, 10) : NaN;
    if (!storeId || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ error: 'storeId and menuItemId are required' }, { status: 400 });
    }

    const { data: store } = await db
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single();
    if (!store?.id || store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: item, error } = await db
      .from('merchant_menu_items')
      .select(
        'id, item_id, item_name, item_description, item_image_url, food_type, in_stock, selling_price, base_price, category_id, preparation_time_minutes, serves, spice_level'
      )
      .eq('id', menuItemId)
      .eq('store_id', store.id)
      .maybeSingle();

    if (error) {
      console.error('[order-line-item-menu]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    let categoryName: string | null = null;
    if (item.category_id != null) {
      const { data: cat } = await db
        .from('merchant_menu_categories')
        .select('category_name')
        .eq('id', item.category_id)
        .maybeSingle();
      categoryName = (cat as { category_name?: string } | null)?.category_name ?? null;
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        item_id: item.item_id,
        item_name: item.item_name,
        item_description: item.item_description,
        item_image_url: item.item_image_url,
        food_type: item.food_type,
        in_stock: item.in_stock,
        selling_price: item.selling_price != null ? Number(item.selling_price) : null,
        base_price: item.base_price != null ? Number(item.base_price) : null,
        category_name: categoryName,
        preparation_time_minutes: item.preparation_time_minutes,
        serves: item.serves,
        spice_level: item.spice_level,
      },
    });
  } catch (e) {
    console.error('[order-line-item-menu]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
