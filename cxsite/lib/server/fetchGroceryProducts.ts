import { supabase } from '@/lib/supabase'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import {
  isMenuCategoryEffectivelyInStock,
  isMenuItemEffectivelyInStock,
  type MenuOosRow,
} from '@/lib/menuEffectiveStock'
import { markupCustomerPrice } from '@/lib/server/customerPricing'
import {
  applyCustomerMenuItemPricing,
  resolveStoreCommission,
} from '@/lib/server/resolveStoreCommission'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import {
  DEFAULT_SERVICE_RADIUS_KM,
} from '@/lib/server/merchantStoreGeo'
import {
  enrichStoreListMeta,
  fetchGeoFilteredStores,
  fetchPanIndiaStores,
} from '@/lib/server/fetchMerchantStores'
import { resolveMerchantStore, storeDisplayName } from '@/lib/server/resolveMerchantStore'
import { lookupMerchantStoreRow } from '@/lib/server/lookupMerchantStoreRow'

export type GroceryProductDto = {
  id: string
  menuItemPk: number
  name: string
  subtitle: string | null
  category: string | null
  imageUrl: string | null
  price: number
  mrp: number | null
  discountPercent: number | null
  sizeLabel: string | null
  storeName: string
  storeSlug: string | null
  inStock: boolean
}

export type GroceryProductVariantDto = {
  id: string
  label: string
  price: number
  mrp: number | null
  discountPercent: number | null
  isDefault: boolean
  inStock: boolean
}

export type GroceryCustomizationOptionDto = {
  id: string
  name: string
  price: number
  inStock: boolean
}

export type GroceryCustomizationGroupDto = {
  id: string
  title: string
  type: string | null
  isRequired: boolean
  minSelection: number
  maxSelection: number
  options: GroceryCustomizationOptionDto[]
}

export type GroceryProductDetailDto = GroceryProductDto & {
  description: string | null
  variants: GroceryProductVariantDto[]
  customizations: GroceryCustomizationGroupDto[]
}

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/** Menu reads need service role — anon RLS returns 0 rows for merchant_menu_items. */
function getGroceryMenuDb() {
  return getSupabaseServiceRole()
}

function formatSizeLabel(
  value: string | number | null | undefined,
  unit: string | null | undefined
): string | null {
  const v = value != null ? String(value).trim() : ''
  const u = unit != null ? String(unit).trim() : ''
  if (!v && !u) return null
  if (!v) return u
  if (!u) return v
  return `${v} ${u}`
}

function discountFromPrices(price: number, mrp: number | null, rawPct: number | null): number | null {
  if (rawPct != null && Number.isFinite(rawPct) && rawPct > 0) {
    return Math.round(rawPct)
  }
  if (mrp != null && mrp > price && price > 0) {
    return Math.round(((mrp - price) / mrp) * 100)
  }
  return null
}

async function fetchGroceryStoreRows(
  userLat?: number,
  userLon?: number,
  radiusKm = DEFAULT_SERVICE_RADIUS_KM
) {
  const hasCoords =
    userLat != null &&
    userLon != null &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLon)

  let rows = hasCoords
    ? await enrichStoreListMeta(await fetchGeoFilteredStores(userLat!, userLon!, radiusKm))
    : await fetchPanIndiaStores()

  return rows.filter(
    (r) => String(r.store_type ?? '').toUpperCase() === 'GROCERY' && !!r.public_slug?.trim()
  )
}

export async function fetchGroceryProducts(params: {
  userLat?: number
  userLon?: number
  radiusKm?: number
  limit?: number
  storeSlug?: string
}): Promise<{ products: GroceryProductDto[]; total: number; storeName?: string }> {
  const limit = Math.min(120, Math.max(1, params.limit ?? 24))

  let stores: Awaited<ReturnType<typeof fetchGroceryStoreRows>>
  if (params.storeSlug?.trim()) {
    const row = await lookupMerchantStoreRow(params.storeSlug.trim())
    if (!row) {
      return { products: [], total: 0 }
    }
    const storeType = String(row.store_type ?? '').toUpperCase()
    if (storeType && storeType !== 'GROCERY') {
      return { products: [], total: 0 }
    }
    stores = [
      {
        id: Number(row.id),
        name: storeDisplayName(row as Parameters<typeof storeDisplayName>[0]),
        public_slug: row.public_slug != null ? String(row.public_slug) : null,
        store_type: 'GROCERY',
      } as Awaited<ReturnType<typeof fetchGroceryStoreRows>>[number],
    ]
  } else {
    stores = await fetchGroceryStoreRows(params.userLat, params.userLon, params.radiusKm)
  }

  const storeIds = stores.map((s) => s.id).filter((id) => Number.isFinite(id))
  if (!storeIds.length) return { products: [], total: 0 }

  const storeByPk = new Map(
    stores.map((s) => [
      s.id,
      {
        name: s.name,
        slug: s.public_slug,
      },
    ])
  )

  const db = getDb()
  const [categoriesRes, itemsRes] = await Promise.all([
    db
      .from('merchant_menu_categories')
      .select(
        'id, store_id, category_name, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, is_active'
      )
      .in('store_id', storeIds)
      .eq('is_active', true),
    db
      .from('merchant_menu_items')
      .select(
        'id, item_id, item_name, item_description, item_image_url, base_price, selling_price, discount_percentage, category_id, in_stock, is_active, is_popular, is_recommended, display_order, item_size_value, item_size_unit, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, approval_status, store_id'
      )
      .in('store_id', storeIds)
      .eq('is_active', true)
      .in('approval_status', ['APPROVED', 'PENDING'])
      .or('is_deleted.eq.false,is_deleted.is.null')
      .order('is_recommended', { ascending: false })
      .order('is_popular', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(limit * 4),
  ])

  if (itemsRes.error) throw itemsRes.error

  const categoryRows = (categoriesRes.data ?? []) as Array<
    MenuOosRow & { id: number; store_id: number; category_name: string; is_active?: boolean }
  >
  const categoryById = new Map(
    categoryRows
      .filter((c) => isMenuCategoryEffectivelyInStock(c))
      .map((c) => [c.id, c])
  )
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.category_name]))

  const rawItems = (itemsRes.data ?? []).filter((row: Record<string, unknown>) => {
    const categoryId = row.category_id as number | null
    const category = categoryId != null ? categoryById.get(categoryId) : null
    if (categoryId != null && !category) return false
    return isMenuItemEffectivelyInStock(
      {
        in_stock: row.in_stock as boolean | null,
        out_of_stock_manual: row.out_of_stock_manual as boolean | null,
        out_of_stock_until: row.out_of_stock_until as string | null,
        out_of_stock_updated_at: row.out_of_stock_updated_at as string | null,
        category_out_of_stock_manual: category?.out_of_stock_manual ?? null,
        category_out_of_stock_until: category?.out_of_stock_until ?? null,
        category_out_of_stock_updated_at: category?.out_of_stock_updated_at ?? null,
      },
      category
    )
  })

  const itemPks = rawItems
    .map((row: Record<string, unknown>) => Number(row.id))
    .filter((id) => Number.isFinite(id))

  const variantSizeByItem = new Map<number, string>()
  if (itemPks.length > 0) {
    const { data: variantRows } = await db
      .from('merchant_menu_item_variants')
      .select('menu_item_id, variant_name, is_default, display_order, in_stock')
      .in('menu_item_id', itemPks)
      .eq('in_stock', true)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true })

    for (const v of variantRows ?? []) {
      const pk = Number((v as { menu_item_id: number }).menu_item_id)
      if (!Number.isFinite(pk) || variantSizeByItem.has(pk)) continue
      const label = String((v as { variant_name?: string }).variant_name ?? '').trim() || null
      if (label) variantSizeByItem.set(pk, label)
    }
  }

  const commissionCache = new Map<number, number>()
  const allProducts: GroceryProductDto[] = []

  for (const row of rawItems as Array<Record<string, unknown>>) {
    const storePk = Number(row.store_id)
    const storeMeta = storeByPk.get(storePk)
    if (!storeMeta) continue

    if (!commissionCache.has(storePk)) {
      const commission = await resolveStoreCommission(storePk)
      commissionCache.set(storePk, commission.percent)
    }

    const priced = applyCustomerMenuItemPricing(row, commissionCache.get(storePk)!)
    const sellPrice = priced.offer_price ?? priced.price
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) continue

    const mrp =
      priced.offer_price != null && priced.price > sellPrice ? priced.price : null
    const menuItemPk = Number(row.id)
    const categoryId = row.category_id as number | null
    const categoryName = categoryId != null ? categoryNameById.get(categoryId) ?? null : null
    const description = String(row.item_description ?? '').trim() || null

    const sizeLabel =
      formatSizeLabel(
        row.item_size_value as string | number | null,
        row.item_size_unit as string | null
      ) ?? variantSizeByItem.get(menuItemPk) ?? null

    allProducts.push({
      id: String(row.item_id ?? row.id),
      menuItemPk,
      name: String(row.item_name ?? ''),
      subtitle: description ?? categoryName,
      category: categoryName,
      imageUrl: toAbsoluteImageUrl((row.item_image_url as string | null) ?? null),
      price: sellPrice,
      mrp,
      discountPercent: discountFromPrices(
        sellPrice,
        mrp,
        row.discount_percentage != null ? Number(row.discount_percentage) : null
      ),
      sizeLabel,
      storeName: storeMeta.name,
      storeSlug: storeMeta.slug,
      inStock: row.in_stock !== false,
    })
  }

  const products = allProducts.slice(0, limit)
  return {
    products,
    total: allProducts.length,
    storeName: params.storeSlug ? stores[0]?.name : undefined,
  }
}

function mapMenuRowToProduct(
  row: Record<string, unknown>,
  storeMeta: { name: string; slug: string | null },
  commissionPercent: number,
  categoryNameById: Map<number, string>,
  categoryById: Map<number, MenuOosRow & { id: number; category_name: string }>,
  variantSizeByItem: Map<number, string>
): GroceryProductDto | null {
  const categoryId = row.category_id as number | null
  const category = categoryId != null ? categoryById.get(categoryId) : null
  if (categoryId != null && !category) return null
  if (
    !isMenuItemEffectivelyInStock(
      {
        in_stock: row.in_stock as boolean | null,
        out_of_stock_manual: row.out_of_stock_manual as boolean | null,
        out_of_stock_until: row.out_of_stock_until as string | null,
        out_of_stock_updated_at: row.out_of_stock_updated_at as string | null,
        category_out_of_stock_manual: category?.out_of_stock_manual ?? null,
        category_out_of_stock_until: category?.out_of_stock_until ?? null,
        category_out_of_stock_updated_at: category?.out_of_stock_updated_at ?? null,
      },
      category
    )
  ) {
    return null
  }

  const priced = applyCustomerMenuItemPricing(row, commissionPercent)
  const sellPrice = priced.offer_price ?? priced.price
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return null

  const mrp = priced.offer_price != null && priced.price > sellPrice ? priced.price : null
  const menuItemPk = Number(row.id)
  const categoryName = categoryId != null ? categoryNameById.get(categoryId) ?? null : null
  const description = String(row.item_description ?? '').trim() || null

  const sizeLabel =
    formatSizeLabel(
      row.item_size_value as string | number | null,
      row.item_size_unit as string | null
    ) ?? variantSizeByItem.get(menuItemPk) ?? null

  return {
    id: String(row.item_id ?? row.id),
    menuItemPk,
    name: String(row.item_name ?? ''),
    subtitle: description ?? categoryName,
    category: categoryName,
    imageUrl: toAbsoluteImageUrl((row.item_image_url as string | null) ?? null),
    price: sellPrice,
    mrp,
    discountPercent: discountFromPrices(
      sellPrice,
      mrp,
      row.discount_percentage != null ? Number(row.discount_percentage) : null
    ),
    sizeLabel,
    storeName: storeMeta.name,
    storeSlug: storeMeta.slug,
    inStock: row.in_stock !== false,
  }
}

export async function fetchGroceryProductDetail(params: {
  itemId: string
  storeSlug?: string
}): Promise<GroceryProductDetailDto | null> {
  const itemId = params.itemId.trim()
  if (!itemId) return null

  const db = getGroceryMenuDb()
  if (!db) return null

  const numericId = /^\d+$/.test(itemId) ? Number(itemId) : null

  let storeRow: Record<string, unknown> | null = null
  let storePk: number | null = null

  if (params.storeSlug?.trim()) {
    storeRow = await lookupMerchantStoreRow(params.storeSlug.trim())
    if (!storeRow) return null
    storePk = Number(storeRow.id)
    if (!Number.isFinite(storePk)) return null
    const storeType = String(storeRow.store_type ?? '').toUpperCase()
    if (storeType && storeType !== 'GROCERY') return null
  }

  let itemQuery = db
    .from('merchant_menu_items')
    .select(
      'id, item_id, item_name, item_description, item_image_url, base_price, selling_price, discount_percentage, category_id, in_stock, is_active, display_order, item_size_value, item_size_unit, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, approval_status, store_id'
    )
    .eq('is_active', true)
    .in('approval_status', ['APPROVED', 'PENDING'])
    .or('is_deleted.eq.false,is_deleted.is.null')

  if (storePk != null) {
    itemQuery = itemQuery.eq('store_id', storePk)
  }

  if (numericId != null) {
    itemQuery = itemQuery.or(`item_id.eq.${itemId},id.eq.${numericId}`)
  } else {
    itemQuery = itemQuery.eq('item_id', itemId)
  }

  const { data: itemRows, error: itemError } = await itemQuery.limit(5)
  if (itemError) throw itemError
  if (!itemRows?.length) return null

  let row: Record<string, unknown> | null = null

  if (storeRow) {
    row = (itemRows as Array<Record<string, unknown>>)[0] ?? null
  } else {
    for (const candidate of itemRows as Array<Record<string, unknown>>) {
      const resolved = await lookupMerchantStoreRow(String(candidate.store_id))
      if (resolved && String(resolved.store_type ?? '').toUpperCase() === 'GROCERY') {
        row = candidate
        storeRow = resolved
        break
      }
    }
  }

  if (!row || !storeRow) return null

  storePk = Number(storeRow.id)
  const storeMeta = {
    name: storeDisplayName(storeRow as Parameters<typeof storeDisplayName>[0]),
    slug: storeRow.public_slug != null ? String(storeRow.public_slug) : null,
  }

  const menuItemPk = Number(row.id)
  const categoryId = row.category_id as number | null

  const [categoriesRes, variantsRes, customizationsRes, commission] = await Promise.all([
    categoryId != null
      ? db
          .from('merchant_menu_categories')
          .select(
            'id, category_name, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at, is_active'
          )
          .eq('id', categoryId)
          .eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from('merchant_menu_item_variants')
      .select('variant_id, variant_name, variant_price, is_default, display_order, in_stock')
      .eq('menu_item_id', menuItemPk)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true }),
    db
      .from('merchant_menu_item_customizations')
      .select(
        'id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order'
      )
      .eq('menu_item_id', menuItemPk)
      .order('display_order', { ascending: true }),
    resolveStoreCommission(storePk),
  ])

  const categoryRows = categoriesRes.data
    ? [categoriesRes.data as MenuOosRow & { id: number; category_name: string }]
    : []
  const categoryById = new Map(
    categoryRows
      .filter((c) => isMenuCategoryEffectivelyInStock(c))
      .map((c) => [c.id, c])
  )
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.category_name]))

  const variantSizeByItem = new Map<number, string>()
  const variants: GroceryProductVariantDto[] = []

  for (const v of variantsRes.data ?? []) {
    const variantRow = v as {
      variant_id: string
      variant_name?: string
      variant_price?: number | string
      is_default?: boolean
      in_stock?: boolean
    }

    const label = String(variantRow.variant_name ?? '').trim()
    if (!label) continue

    const netPrice = parseFloat(String(variantRow.variant_price ?? '0'))
    if (!Number.isFinite(netPrice) || netPrice <= 0) continue

    const customerPrice = markupCustomerPrice(netPrice, commission.percent)
    variants.push({
      id: String(variantRow.variant_id),
      label,
      price: customerPrice,
      mrp: null,
      discountPercent: null,
      isDefault: variantRow.is_default === true,
      inStock: variantRow.in_stock !== false,
    })

    if (!variantSizeByItem.has(menuItemPk)) {
      variantSizeByItem.set(menuItemPk, label)
    }
  }

  const baseProduct = mapMenuRowToProduct(
    row,
    storeMeta,
    commission.percent,
    categoryNameById,
    categoryById,
    variantSizeByItem
  )
  if (!baseProduct) return null

  const description = String(row.item_description ?? '').trim() || null

  if (!variants.length && baseProduct.sizeLabel) {
    variants.push({
      id: 'default',
      label: baseProduct.sizeLabel,
      price: baseProduct.price,
      mrp: baseProduct.mrp,
      discountPercent: baseProduct.discountPercent,
      isDefault: true,
      inStock: baseProduct.inStock,
    })
  }

  const customizationGroups: GroceryCustomizationGroupDto[] = []
  const custRows = customizationsRes.data ?? []
  if (custRows.length > 0) {
    const custPks = custRows
      .map((c) => Number((c as { id: number }).id))
      .filter((id) => Number.isFinite(id))

    let addonRows: Array<Record<string, unknown>> = []
    if (custPks.length > 0) {
      const { data: addons } = await db
        .from('merchant_menu_item_addons')
        .select('addon_id, customization_id, addon_name, addon_price, in_stock, display_order')
        .in('customization_id', custPks)
        .order('display_order', { ascending: true })
      addonRows = (addons ?? []) as Array<Record<string, unknown>>
    }

    const addonsByCustPk = new Map<number, Array<Record<string, unknown>>>()
    for (const addon of addonRows) {
      const pk = Number(addon.customization_id)
      if (!Number.isFinite(pk)) continue
      const list = addonsByCustPk.get(pk) ?? []
      list.push(addon)
      addonsByCustPk.set(pk, list)
    }

    for (const c of custRows as Array<Record<string, unknown>>) {
      const pk = Number(c.id)
      const addons = addonsByCustPk.get(pk) ?? []
      const options: GroceryCustomizationOptionDto[] = addons
        .map((a) => {
          const name = String(a.addon_name ?? '').trim()
          if (!name) return null
          const net = parseFloat(String(a.addon_price ?? '0'))
          const price =
            Number.isFinite(net) && net > 0
              ? markupCustomerPrice(net, commission.percent)
              : 0
          return {
            id: String(a.addon_id ?? a.id),
            name,
            price,
            inStock: a.in_stock !== false,
          }
        })
        .filter((o): o is GroceryCustomizationOptionDto => o != null)

      if (!options.length) continue

      customizationGroups.push({
        id: String(c.customization_id ?? c.id),
        title: String(c.customization_title ?? 'Options'),
        type: c.customization_type != null ? String(c.customization_type) : null,
        isRequired: c.is_required === true,
        minSelection: Number(c.min_selection ?? 0) || 0,
        maxSelection: Number(c.max_selection ?? 1) || 1,
        options,
      })
    }
  }

  return {
    ...baseProduct,
    description,
    variants,
    customizations: customizationGroups,
  }
}
