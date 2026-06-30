import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import {
  applyCustomerMenuItemPricing,
  resolveStoreCommission,
} from '@/lib/server/resolveStoreCommission'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'

/** Server-side DB: service role bypasses RLS on merchant_menu_items (anon often returns 0 rows). */
function getMenuDb() {
  return getSupabaseServiceRole() ?? supabase
}

/**
 * GET /api/restaurants/[storeId]/menu
 *
 * Connection: merchant_menu_items.store_id (bigint) = merchant_stores.id (bigint).
 * So for store id=14 (store_id='GMMC1001') we return all rows where merchant_menu_items.store_id = 14.
 *
 * storeId in URL can be:
 * - merchant_stores.store_id (text), e.g. GMMC1001, GMMC1002
 * - merchant_stores.id (numeric string), e.g. 14, 15
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    if (!storeId || !String(storeId).trim()) {
      return NextResponse.json({ error: 'Missing store id', items: [], categories: [] }, { status: 400 })
    }

    const idParam = String(storeId).trim()
    const numericId = /^\d+$/.test(idParam) ? parseInt(idParam, 10) : null

    const db = getMenuDb()

    // Resolve store: by store_id (text) first, then by id if param is numeric
    let store: { id: number } | null = null
    const byStoreId = await db
      .from('merchant_stores')
      .select('id')
      .eq('store_id', idParam)
      .maybeSingle()
    if (byStoreId.data) {
      store = byStoreId.data as { id: number }
    } else if (numericId != null) {
      const byId = await db
        .from('merchant_stores')
        .select('id')
        .eq('id', numericId)
        .maybeSingle()
      if (byId.data) store = byId.data as { id: number }
    }

    if (!store) {
      if (DEBUG) console.log('[menu] Store not found for storeId:', idParam)
      return NextResponse.json({ error: 'Store not found', items: [], categories: [] }, { status: 404 })
    }

    const storeIdNum = store.id

    // Fetch menu: merchant_menu_items.store_id = merchant_stores.id (bigint).
    // Use service role (SUPABASE_SERVICE_ROLE_KEY) so RLS does not return empty for anon.
    const [categoriesRes, itemsRes] = await Promise.all([
      db
        .from('merchant_menu_categories')
        .select('id, category_name, display_order')
        .eq('store_id', storeIdNum)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      db
        .from('merchant_menu_items')
        .select(
          'id, item_id, item_name, item_description, item_image_url, food_type, base_price, selling_price, discount_percentage, category_id, in_stock, is_active, display_order, is_popular, is_recommended, preparation_time_minutes'
        )
        .eq('store_id', storeIdNum)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .order('display_order', { ascending: true }),
    ])

    if (DEBUG) {
      console.log(
        '[menu] storeIdNum=',
        storeIdNum,
        'serviceRole=',
        Boolean(getSupabaseServiceRole()),
        'categories=',
        (categoriesRes.data ?? []).length,
        'items=',
        (itemsRes.data ?? []).length,
        'itemsError=',
        itemsRes.error?.message
      )
    }

    if (itemsRes.error) {
      console.error('[menu] merchant_menu_items error:', itemsRes.error)
      return NextResponse.json({ error: 'Failed to fetch menu', items: [], categories: [] }, { status: 500 })
    }

    const categories = (categoriesRes.data ?? []).map((c: { id: number; category_name: string; display_order?: number }) => ({
      id: c.id,
      name: c.category_name,
      display_order: c.display_order ?? 0,
    }))
    const categoryById: Record<number, string> = Object.fromEntries(categories.map((c: { id: number; name: string }) => [c.id, c.name]))

    const rawItems = (itemsRes.data ?? []).filter(
      (row: Record<string, unknown>) => row.is_active !== false
    )

    const COMMISSION_TIMEOUT_MS = 4_000
    const commission = await Promise.race([
      resolveStoreCommission(storeIdNum),
      new Promise<Awaited<ReturnType<typeof resolveStoreCommission>>>((resolve) =>
        setTimeout(
          () => resolve({ percent: 15, sourceKind: 'DEFAULT' }),
          COMMISSION_TIMEOUT_MS
        )
      ),
    ])

    const items = rawItems.map((row: Record<string, unknown>) => {
      const priced = applyCustomerMenuItemPricing(row, commission.percent)
      return {
        id: String(row.id),
        item_id: row.item_id,
        item_name: row.item_name ?? '',
        description: (row.item_description as string) ?? null,
        image_url: toAbsoluteImageUrl((row.item_image_url as string) ?? null),
        category: row.category_id ? (categoryById[row.category_id as number] ?? null) : null,
        category_id: row.category_id ?? null,
        category_item: (row.food_type as string) ?? 'VEG',
        price: priced.price,
        base_price: priced.base_price,
        offer_price: priced.offer_price,
        in_stock: row.in_stock !== false,
        is_active: row.is_active !== false,
        is_popular: row.is_popular === true,
        is_recommended: row.is_recommended === true,
        preparation_time_minutes: row.preparation_time_minutes ?? null,
      }
    })

    return NextResponse.json({ items, categories })
  } catch (err) {
    console.error('[GET /api/restaurants/[storeId]/menu]', err)
    return NextResponse.json({ error: 'Internal server error', items: [], categories: [] }, { status: 500 })
  }
}
