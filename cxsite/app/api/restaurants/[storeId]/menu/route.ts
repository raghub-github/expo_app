import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import {
  applyCustomerMenuItemPricing,
  resolveStoreCommission,
} from '@/lib/server/resolveStoreCommission'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import {
  isMenuCategoryEffectivelyInStock,
  isMenuItemEffectivelyInStock,
  type MenuOosRow,
} from '@/lib/menuEffectiveStock'

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
        .select(
          'id, category_name, display_order, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, is_active'
        )
        .eq('store_id', storeIdNum)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      db
        .from('merchant_menu_items')
        .select(
          'id, item_id, item_name, item_description, item_image_url, food_type, base_price, selling_price, discount_percentage, category_id, in_stock, is_active, display_order, is_popular, is_recommended, preparation_time_minutes, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, approval_status'
        )
        .eq('store_id', storeIdNum)
        .eq('approval_status', 'APPROVED')
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

    const categoryRows = (categoriesRes.data ?? []) as Array<
      MenuOosRow & { id: number; category_name: string; display_order?: number; is_active?: boolean }
    >

    const categories = categoryRows
      .filter((c) => isMenuCategoryEffectivelyInStock(c))
      .map((c) => ({
        id: c.id,
        name: c.category_name,
        display_order: c.display_order ?? 0,
      }))

    const categoryById: Record<
      number,
      MenuOosRow & { id: number; category_name: string; out_of_stock_updated_at?: string | null }
    > = Object.fromEntries(categoryRows.map((c) => [c.id, c]))
    const categoryNameById: Record<number, string> = Object.fromEntries(
      categoryRows.map((c) => [c.id, c.category_name])
    )

    const rawItems = (itemsRes.data ?? []).filter(
      (row: Record<string, unknown>) => row.is_active !== false
    )

    const itemIds = rawItems
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id))
    const approvedImageByItemId = new Map<number, string>()
    if (itemIds.length > 0) {
      const { data: imageRows } = await db
        .from('merchant_menu_item_images')
        .select('menu_item_id, image_url, is_primary, created_at, moderation_status')
        .in('menu_item_id', itemIds)
        .eq('moderation_status', 'APPROVED')
      const grouped = new Map<number, Array<{ menu_item_id: number; image_url: string; is_primary?: boolean | null; created_at?: string | null }>>()
      for (const img of imageRows ?? []) {
        const menuItemId = Number((img as { menu_item_id: number }).menu_item_id)
        if (!Number.isFinite(menuItemId)) continue
        const list = grouped.get(menuItemId) ?? []
        list.push(img as { menu_item_id: number; image_url: string; is_primary?: boolean | null; created_at?: string | null })
        grouped.set(menuItemId, list)
      }
      for (const [menuItemId, imgs] of grouped) {
        const sorted = [...imgs].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1
          if (!a.is_primary && b.is_primary) return 1
          return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
        })
        const url = sorted[0]?.image_url
        if (url) approvedImageByItemId.set(menuItemId, url)
      }
    }

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

    const items = rawItems
      .map((row: Record<string, unknown>) => {
        const categoryId = row.category_id as number | null
        const category = categoryId != null ? categoryById[categoryId] ?? null : null
        const itemOos = {
          in_stock: row.in_stock as boolean | null,
          out_of_stock_manual: row.out_of_stock_manual as boolean | null,
          out_of_stock_until: row.out_of_stock_until as string | null,
          out_of_stock_updated_at: row.out_of_stock_updated_at as string | null,
          category_out_of_stock_manual: category?.out_of_stock_manual ?? null,
          category_out_of_stock_until: category?.out_of_stock_until ?? null,
          category_out_of_stock_updated_at: category?.out_of_stock_updated_at ?? null,
        }
        const effectivelyInStock = isMenuItemEffectivelyInStock(itemOos, category)
        if (!effectivelyInStock) return null

        const priced = applyCustomerMenuItemPricing(row, commission.percent)
        const approvedImage =
          approvedImageByItemId.get(Number(row.id)) ??
          ((row.item_image_url as string | null | undefined) ?? null)
        return {
          id: String(row.id),
          item_id: row.item_id,
          item_name: row.item_name ?? '',
          description: (row.item_description as string) ?? null,
          image_url: toAbsoluteImageUrl(approvedImage),
          category: categoryId ? (categoryNameById[categoryId] ?? null) : null,
          category_id: categoryId ?? null,
          category_item: (row.food_type as string) ?? 'VEG',
          price: priced.price,
          base_price: priced.base_price,
          offer_price: priced.offer_price,
          in_stock: true,
          is_active: row.is_active !== false,
          is_popular: row.is_popular === true,
          is_recommended: row.is_recommended === true,
          preparation_time_minutes: row.preparation_time_minutes ?? null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    const response = NextResponse.json({ items, categories })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  } catch (err) {
    console.error('[GET /api/restaurants/[storeId]/menu]', err)
    const errResponse = NextResponse.json({ error: 'Internal server error', items: [], categories: [] }, { status: 500 })
    errResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return errResponse
  }
}
