import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'
import { deleteFromR2, extractR2KeyFromUrl } from '@/lib/r2'
import { logStoreActivity } from '@/lib/store-activity-feed'
import { buildMenuItemOosModePatch, buildMenuItemStockTogglePatch } from '@/lib/merchant-menu-item-stock'
import { client as pgClient } from '@/lib/drizzle'
import { expireTimedMenuOutOfStockForStore } from '@/lib/menu-oos-expiry'
import { enforcePlanLimitsForStoreNumericId } from '@/lib/plan-enforce'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key"
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * GET /api/merchant/menu-items?storeId=XXX
 * Fetch menu items for a store using service role (bypasses RLS).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    const view = searchParams.get('view')?.trim().toLowerCase()
    if (!storeId) {
      return NextResponse.json({ error: 'storeId query param required' }, { status: 400 })
    }

    const access = await assertStoreAccess(storeId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    try {
      await expireTimedMenuOutOfStockForStore(pgClient, access.storeIdNum)
    } catch (expireErr) {
      console.error('[menu-items GET] expireTimedMenuOutOfStock failed:', expireErr)
    }

    const { data: items, error } = await supabase
      .from('merchant_menu_items')
      .select('*')
      .eq('store_id', access.storeIdNum)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[menu-items GET]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const list = items ?? []
    if (list.length === 0) return NextResponse.json([])

    const itemIds = list.map((r: { id: number }) => r.id)
    const imageMetaByItemId: Record<
      number,
      { image_count: number; primary_image_moderation_status: string | null }
    > = {}
    if (itemIds.length > 0) {
      const { data: imageRows } = await supabase
        .from('merchant_menu_item_images')
        .select('menu_item_id, moderation_status, is_primary')
        .in('menu_item_id', itemIds)
      for (const id of itemIds) {
        const rows = (imageRows ?? []).filter((r: { menu_item_id: number }) => r.menu_item_id === id)
        const primary = rows.find((r: { is_primary?: boolean }) => r.is_primary) ?? rows[0]
        imageMetaByItemId[id] = {
          image_count: rows.length,
          primary_image_moderation_status: primary
            ? String((primary as { moderation_status?: string }).moderation_status ?? 'PENDING').toUpperCase()
            : null,
        }
      }
    }

    const withImageMeta = (item: Record<string, unknown>) => {
      const id = Number(item.id)
      const meta = imageMetaByItemId[id]
      return {
        ...item,
        image_count: meta?.image_count ?? 0,
        primary_image_moderation_status: meta?.primary_image_moderation_status ?? null,
      }
    }

    /** Card/list grid only — skip heavy customization joins for faster first paint. */
    if (view === 'list') {
      const lite = list.map((item: Record<string, unknown>) => ({
        ...withImageMeta(item),
        customizations: [],
        variants: [],
        linked_modifier_groups: [],
      }))
      return NextResponse.json(lite)
    }

    const [{ data: custRows }, { data: variantRows }, { data: modifierLinks }] = await Promise.all([
      supabase
        .from('merchant_menu_item_customizations')
        .select('*')
        .in('menu_item_id', itemIds)
        .order('display_order', { ascending: true }),
      supabase
        .from('merchant_menu_item_variants')
        .select('*')
        .in('menu_item_id', itemIds)
        .order('display_order', { ascending: true }),
      supabase
        .from('merchant_item_modifier_groups')
        .select('id, menu_item_id, modifier_group_id, display_order')
        .in('menu_item_id', itemIds)
        .order('display_order', { ascending: true }),
    ])
    const custList = custRows ?? []
    const custIds = custList.map((c: { id: number }) => c.id)
    let addonList: any[] = []
    if (custIds.length > 0) {
      const { data: addonRows } = await supabase
        .from('merchant_menu_item_addons')
        .select('*')
        .in('customization_id', custIds)
        .order('display_order', { ascending: true })
      addonList = addonRows ?? []
    }
    const variantList = variantRows ?? []

    const addonsByCustId: Record<number, any[]> = {}
    for (const a of addonList) {
      const cid = a.customization_id
      if (!addonsByCustId[cid]) addonsByCustId[cid] = []
      addonsByCustId[cid].push(a)
    }
    const custByItemId: Record<number, any[]> = {}
    for (const c of custList) {
      const mid = c.menu_item_id
      if (!custByItemId[mid]) custByItemId[mid] = []
      custByItemId[mid].push({ ...c, addons: addonsByCustId[c.id] ?? [] })
    }
    const variantsByItemId: Record<number, any[]> = {}
    for (const v of variantList) {
      const mid = v.menu_item_id
      if (!variantsByItemId[mid]) variantsByItemId[mid] = []
      variantsByItemId[mid].push(v)
    }

    const linkedByItemId: Record<number, any[]> = {}
    try {
      const linkList = modifierLinks ?? []
      const modifierGroupIds = [...new Set(linkList.map((l: { modifier_group_id: number }) => l.modifier_group_id))]
      const modifierGroupsById: Record<number, any> = {}
      const modifierOptionsByGroupId: Record<number, any[]> = {}
      if (modifierGroupIds.length > 0) {
        const [{ data: groups }, { data: opts }] = await Promise.all([
          supabase
            .from('merchant_modifier_groups')
            .select('id, title, description, is_required, min_selection, max_selection')
            .in('id', modifierGroupIds),
          supabase
            .from('merchant_modifier_options')
            .select('id, modifier_group_id, option_code, name, price_delta, in_stock, display_order')
            .in('modifier_group_id', modifierGroupIds)
            .order('display_order', { ascending: true }),
        ])
        for (const g of groups ?? []) modifierGroupsById[g.id] = g
        for (const o of opts ?? []) {
          const gid = o.modifier_group_id
          if (!modifierOptionsByGroupId[gid]) modifierOptionsByGroupId[gid] = []
          modifierOptionsByGroupId[gid].push(o)
        }
      }
      for (const link of linkList) {
        const mid = link.menu_item_id
        const g = modifierGroupsById[link.modifier_group_id]
        if (!g) continue
        if (!linkedByItemId[mid]) linkedByItemId[mid] = []
        linkedByItemId[mid].push({
          id: link.id,
          modifier_group_id: link.modifier_group_id,
          display_order: link.display_order ?? 0,
          title: g.title,
          description: g.description ?? null,
          is_required: g.is_required ?? false,
          min_selection: g.min_selection ?? 0,
          max_selection: g.max_selection ?? 1,
          options: (modifierOptionsByGroupId[link.modifier_group_id] ?? []).map((o: any) => ({
            id: o.id,
            option_id: o.option_code,
            name: o.name,
            price_delta: o.price_delta,
            in_stock: o.in_stock ?? true,
            display_order: o.display_order ?? 0,
          })),
        })
      }
    } catch (linkErr) {
      console.warn('[menu-items GET] linked modifier groups skipped', linkErr)
    }

    const enriched = list.map((item: any) => ({
      ...withImageMeta(item),
      customizations: custByItemId[item.id] ?? [],
      variants: variantsByItemId[item.id] ?? [],
      linked_modifier_groups: linkedByItemId[item.id] ?? [],
    }))

    return NextResponse.json(enriched)
  } catch (err: unknown) {
    console.error('[menu-items GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/merchant/menu-items
 * Create a menu item using service role (bypasses RLS).
 * Body: { restaurant_id, item_name, category_id, ... } (same as createMenuItem payload)
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const storeId = body?.restaurant_id ?? body?.storeId
    if (!storeId || !body?.item_name || body?.base_price == null || body?.selling_price == null) {
      return NextResponse.json(
        { error: 'restaurant_id, item_name, base_price, selling_price required' },
        { status: 400 }
      )
    }

    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', String(storeId).trim())
      .single()

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    if (store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store does not belong to this merchant' }, { status: 403 })
    }

    // Check plan limits before inserting
    const { count: currentItemCount } = await supabase
      .from('merchant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_deleted', false)

    const { data: activeSub } = await supabase
      .from('merchant_subscriptions')
      .select('plan_id, merchant_plans(max_menu_items)')
      .eq('merchant_id', store.parent_id)
      .or(`store_id.is.null,store_id.eq.${store.id}`)
      .eq('is_active', true)
      .eq('subscription_status', 'ACTIVE')
      .gt('expiry_date', new Date().toISOString())
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    let maxItems: number | null = (activeSub?.merchant_plans as any)?.max_menu_items ?? null;
    if (!activeSub) {
      const { data: freePlan } = await supabase
        .from('merchant_plans')
        .select('max_menu_items')
        .eq('plan_code', 'FREE')
        .eq('is_active', true)
        .maybeSingle()
      maxItems = freePlan?.max_menu_items ?? 15;
    }

    const willExceedLimit = maxItems !== null && (currentItemCount ?? 0) >= maxItems
    if (willExceedLimit) {
      return NextResponse.json(
        {
          error: 'Menu item limit reached for your plan. Upgrade to add more items.',
          code: 'plan_limit_reached',
        },
        { status: 403 }
      )
    }

    const categoryId = body.category_id ?? null
    if (categoryId) {
      const { data: catData, error: catError } = await supabase
        .from('merchant_menu_categories')
        .select('id')
        .eq('id', categoryId)
        .single()
      if (catError || !catData) {
        return NextResponse.json({ error: 'Category not found' }, { status: 400 })
      }
    }

    const hasCustomizations = Array.isArray(body.customizations) && body.customizations.length > 0
    const hasAddons = hasCustomizations && body.customizations.some((c: any) => c.addons?.length > 0)
    const allergens = Array.isArray(body.allergens) ? body.allergens : (typeof body.allergens === 'string' ? body.allergens.split(',').map((a: string) => a.trim()).filter(Boolean) : [])
    const itemTagsRaw = Array.isArray(body.item_tags)
      ? body.item_tags
      : typeof body.item_tags === 'string'
        ? body.item_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []
    const item_tags = itemTagsRaw.length ? itemTagsRaw : null
    const parseOptNum = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    }

    const payload = {
      store_id: store.id,
      category_id: categoryId,
      item_name: body.item_name,
      item_description: body.item_description ?? '',
      item_image_url: body.item_image_url ?? null,
      food_type: body.food_type ?? null,
      spice_level: body.spice_level ?? null,
      cuisine_type: body.cuisine_type ?? null,
      base_price: Number(body.base_price),
      selling_price: Number(body.selling_price),
      discount_percentage: body.discount_percentage ?? 0,
      tax_percentage: body.tax_percentage ?? 0,
      in_stock: body.in_stock ?? true,
      available_quantity: body.available_quantity ?? null,
      low_stock_threshold: body.low_stock_threshold ?? null,
      has_customizations: hasCustomizations,
      has_addons: hasAddons,
      has_variants: body.has_variants ?? false,
      is_popular: body.is_popular ?? false,
      is_recommended: body.is_recommended ?? false,
      preparation_time_minutes: body.preparation_time_minutes ?? 15,
      packaging_charges:
        body.packaging_charges === null || body.packaging_charges === undefined
          ? null
          : Number(body.packaging_charges),
      serves: body.serves ?? 1,
      is_active: body.is_active ?? true,
      allergens: allergens.length ? allergens : null,
      item_tags,
      available_for_delivery: body.available_for_delivery !== undefined ? Boolean(body.available_for_delivery) : true,
      weight_per_serving: parseOptNum(body.weight_per_serving),
      weight_per_serving_unit: body.weight_per_serving_unit ?? 'grams',
      calories_kcal: parseOptNum(body.calories_kcal),
      protein: parseOptNum(body.protein),
      protein_unit: body.protein_unit ?? 'mg',
      carbohydrates: parseOptNum(body.carbohydrates),
      carbohydrates_unit: body.carbohydrates_unit ?? 'mg',
      fat: parseOptNum(body.fat),
      fat_unit: body.fat_unit ?? 'mg',
      fibre: parseOptNum(body.fibre),
      fibre_unit: body.fibre_unit ?? 'mg',
      // Merchant / MX portal: pending agent verification (dashboard agents use APPROVED on create).
      approval_status: 'PENDING' as const,
      approved_at: null,
      approved_by: null,
    }

    const { data, error } = await supabase
      .from('merchant_menu_items')
      .insert([payload])
      .select()
      .single()

    if (error) {
      console.error('[menu-items POST]', error.message, error.code)
      return NextResponse.json(
        { error: error.message || 'Failed to create menu item', code: error.code },
        { status: 500 }
      )
    }

    const menuItemId = data.id as number

    // If an image key was provided, also insert into merchant_menu_item_images as primary image
    if (payload.item_image_url) {
      try {
        await supabase
          .from('merchant_menu_item_images')
          .insert([{
            menu_item_id: menuItemId,
            image_url: payload.item_image_url,
            is_primary: true,
            display_order: 0,
          }]);
      } catch (imgErr) {
        console.error('[menu-items POST] merchant_menu_item_images insert error', imgErr);
      }
    }
    const customizations = Array.isArray(body.customizations) ? body.customizations : []

    for (let i = 0; i < customizations.length; i++) {
      const c = customizations[i]
      const custPayload = {
        menu_item_id: menuItemId,
        customization_title: c.customization_title ?? '',
        customization_type: c.customization_type ?? null,
        is_required: c.is_required ?? false,
        min_selection: c.min_selection ?? 0,
        max_selection: c.max_selection ?? 1,
        display_order: c.display_order ?? i,
      }
      const { data: newCust, error: custErr } = await supabase
        .from('merchant_menu_item_customizations')
        .insert([{
          ...custPayload,
          customization_id: `GMC-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        }])
        .select()
        .single()
      if (custErr) {
        console.error('[menu-items POST] customization', custErr.message)
        continue
      }
      const addons = Array.isArray(c.addons) ? c.addons : []
      for (let j = 0; j < addons.length; j++) {
        const a = addons[j]
        await supabase.from('merchant_menu_item_addons').insert([{
          customization_id: newCust.id,
          addon_id: `GMA-${Date.now()}-${j}-${Math.random().toString(36).slice(2, 9)}`,
          addon_name: a.addon_name ?? '',
          addon_price: a.addon_price ?? 0,
          in_stock: a.in_stock ?? true,
          display_order: a.display_order ?? j,
        }])
      }
    }

    const variants = Array.isArray(body.variants) ? body.variants : []
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      const variantPrice = typeof v.variant_price === 'number' ? v.variant_price : Number(v.variant_price) || 0
      await supabase.from('merchant_menu_item_variants').insert([{
        menu_item_id: menuItemId,
        variant_id: `GMV-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        variant_name: v.variant_name ?? '',
        variant_type: v.variant_type ?? null,
        variant_price: variantPrice,
        display_order: i,
      }])
    }

    try {
      await logStoreActivity({
        storeId: store.id,
        section: 'menu_item',
        action: 'create',
        entityId: menuItemId,
        entityName: body.item_name,
        summary: `Merchant created item "${body.item_name}"`,
        actorType: 'merchant',
      });
    } catch (_) {}

    await enforcePlanLimitsForStoreNumericId(store.id);

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('[menu-items POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/merchant/menu-items
 * Update a menu item using service role (bypasses RLS).
 * Body: { itemId, storeId, ...itemFields }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const itemId = body?.itemId ?? body?.item_id
    const storeId = body?.storeId ?? body?.restaurant_id
    if (!itemId || !storeId) {
      return NextResponse.json({ error: 'itemId and storeId required' }, { status: 400 })
    }

    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', String(storeId).trim())
      .single()

    if (!store?.id || store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not found or access denied' }, { status: 404 })
    }

    const { data: existingItemRow } = await supabase
      .from('merchant_menu_items')
      .select('id')
      .eq('item_id', String(itemId))
      .eq('store_id', store.id)
      .maybeSingle()
    // Plan-locking was removed from schema; edits are always allowed.

    const hasItemFields =
      body.item_name != null ||
      body.base_price != null ||
      body.selling_price != null ||
      body.in_stock !== undefined ||
      body.item_description !== undefined ||
      body.category_id !== undefined ||
      body.food_type !== undefined ||
      body.spice_level !== undefined ||
      body.cuisine_type !== undefined ||
      body.discount_percentage !== undefined ||
      body.tax_percentage !== undefined ||
      body.available_quantity !== undefined ||
      body.low_stock_threshold !== undefined ||
      body.has_customizations !== undefined ||
      body.has_addons !== undefined ||
      body.has_variants !== undefined ||
      body.is_popular !== undefined ||
      body.is_recommended !== undefined ||
      body.preparation_time_minutes !== undefined ||
      body.packaging_charges !== undefined ||
      body.serves !== undefined ||
      body.is_active !== undefined ||
      body.allergens !== undefined ||
      body.item_image_url !== undefined ||
      body.available_for_delivery !== undefined ||
      body.weight_per_serving !== undefined ||
      body.weight_per_serving_unit !== undefined ||
      body.calories_kcal !== undefined ||
      body.protein !== undefined ||
      body.protein_unit !== undefined ||
      body.carbohydrates !== undefined ||
      body.carbohydrates_unit !== undefined ||
      body.fat !== undefined ||
      body.fat_unit !== undefined ||
      body.fibre !== undefined ||
      body.fibre_unit !== undefined ||
      body.item_tags !== undefined
    let data: any = null

    if (hasItemFields) {
      // If image is being replaced, fetch existing first so we can clean up old R2 key + old DB rows.
      const isUpdatingImage = body.item_image_url !== undefined
      let existingItem: { id: number; item_image_url: string | null } | null = null
      if (isUpdatingImage) {
        const { data: existingRow, error: existingErr } = await supabase
          .from('merchant_menu_items')
          .select('id, item_image_url')
          .eq('item_id', String(itemId))
          .eq('store_id', store.id)
          .maybeSingle()
        if (!existingErr && existingRow?.id) {
          existingItem = existingRow as any
        }
      }

      // Only update fields that are explicitly sent to avoid wiping existing data (e.g. description, image_url)
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.category_id !== undefined) updatePayload.category_id = body.category_id ?? null
      if (body.item_name !== undefined) updatePayload.item_name = body.item_name
      if (body.item_description !== undefined) updatePayload.item_description = body.item_description ?? null
      if (body.item_image_url !== undefined) updatePayload.item_image_url = body.item_image_url ?? null
      if (body.food_type !== undefined) updatePayload.food_type = body.food_type ?? null
      if (body.spice_level !== undefined) updatePayload.spice_level = body.spice_level ?? null
      if (body.cuisine_type !== undefined) updatePayload.cuisine_type = body.cuisine_type ?? null
      if (body.base_price != null) updatePayload.base_price = Number(body.base_price)
      if (body.selling_price != null) updatePayload.selling_price = Number(body.selling_price)
      if (body.discount_percentage !== undefined) updatePayload.discount_percentage = body.discount_percentage ?? 0
      if (body.tax_percentage !== undefined) updatePayload.tax_percentage = body.tax_percentage ?? 0
      if (body.in_stock !== undefined) {
        Object.assign(updatePayload, buildMenuItemStockTogglePatch(body.in_stock !== false))
      }
      if (body.available_quantity !== undefined) updatePayload.available_quantity = body.available_quantity ?? null
      if (body.low_stock_threshold !== undefined) updatePayload.low_stock_threshold = body.low_stock_threshold ?? null
      if (body.has_customizations !== undefined) updatePayload.has_customizations = body.has_customizations ?? false
      if (body.has_addons !== undefined) updatePayload.has_addons = body.has_addons ?? false
      if (body.has_variants !== undefined) updatePayload.has_variants = body.has_variants ?? false
      if (body.is_popular !== undefined) updatePayload.is_popular = body.is_popular ?? false
      if (body.is_recommended !== undefined) updatePayload.is_recommended = body.is_recommended ?? false
      if (body.preparation_time_minutes !== undefined) updatePayload.preparation_time_minutes = body.preparation_time_minutes ?? 15
      if (body.packaging_charges !== undefined) {
        updatePayload.packaging_charges =
          body.packaging_charges === null ? null : Number(body.packaging_charges)
      }
      if (body.serves !== undefined) updatePayload.serves = body.serves ?? 1
      if (body.is_active !== undefined) updatePayload.is_active = body.is_active ?? true
      if (body.allergens !== undefined) {
        const allergens = Array.isArray(body.allergens) ? body.allergens : (typeof body.allergens === 'string' ? body.allergens.split(',').map((a: string) => a.trim()).filter(Boolean) : [])
        updatePayload.allergens = allergens.length ? allergens : null
      }
      if (body.item_tags !== undefined) {
        const tags = Array.isArray(body.item_tags)
          ? body.item_tags
          : typeof body.item_tags === 'string'
            ? body.item_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : []
        updatePayload.item_tags = tags.length ? tags : null
      }
      const patchOptNum = (v: unknown): number | null => {
        if (v === null || v === '') return null
        const n = Number(v)
        return Number.isFinite(n) && n >= 0 ? n : null
      }
      if (body.available_for_delivery !== undefined) {
        updatePayload.available_for_delivery = Boolean(body.available_for_delivery)
      }
      if (body.weight_per_serving !== undefined) {
        updatePayload.weight_per_serving = patchOptNum(body.weight_per_serving)
      }
      if (body.weight_per_serving_unit !== undefined) {
        updatePayload.weight_per_serving_unit = body.weight_per_serving_unit ?? null
      }
      if (body.calories_kcal !== undefined) updatePayload.calories_kcal = patchOptNum(body.calories_kcal)
      if (body.protein !== undefined) updatePayload.protein = patchOptNum(body.protein)
      if (body.protein_unit !== undefined) updatePayload.protein_unit = body.protein_unit ?? null
      if (body.carbohydrates !== undefined) updatePayload.carbohydrates = patchOptNum(body.carbohydrates)
      if (body.carbohydrates_unit !== undefined) updatePayload.carbohydrates_unit = body.carbohydrates_unit ?? null
      if (body.fat !== undefined) updatePayload.fat = patchOptNum(body.fat)
      if (body.fat_unit !== undefined) updatePayload.fat_unit = body.fat_unit ?? null
      if (body.fibre !== undefined) updatePayload.fibre = patchOptNum(body.fibre)
      if (body.fibre_unit !== undefined) updatePayload.fibre_unit = body.fibre_unit ?? null
      const filtered = Object.fromEntries(Object.entries(updatePayload).filter(([, v]) => v !== undefined))
      const { data: updated, error } = await supabase
        .from('merchant_menu_items')
        .update(filtered)
        .eq('item_id', String(itemId))
        .eq('store_id', store.id)
        .select()
        .single()
      if (error) {
        console.error('[menu-items PATCH]', error.message, error.code)
        return NextResponse.json({ error: error.message || 'Failed to update menu item', code: error.code }, { status: 500 })
      }
      data = updated

      // Enforce: one menu item -> one image (replace old when new comes).
      if (body.item_image_url !== undefined) {
        const oldUrl = existingItem?.item_image_url ?? null
        const newUrl = (updated as any)?.item_image_url ?? null

        const oldKey = oldUrl ? extractR2KeyFromUrl(String(oldUrl)) : null
        const newKey = newUrl ? extractR2KeyFromUrl(String(newUrl)) : null

        // Best-effort delete old object when replacing with a new one.
        // Guardrails: only delete keys under our docs/merchants/... menu paths.
        if (oldKey && oldKey !== newKey && oldKey.startsWith('docs/merchants/') && oldKey.includes('/menu/')) {
          deleteFromR2(oldKey).catch((e) => {
            console.error('[menu-items PATCH] Failed to delete old menu item image from R2', e)
          })
        }

        const menuItemInternalId = (updated as any)?.id ?? existingItem?.id
        if (menuItemInternalId != null) {
          try {
            // Remove any old rows for this item, then insert exactly one row if image exists.
            await supabase.from('merchant_menu_item_images').delete().eq('menu_item_id', menuItemInternalId)
            if (newUrl) {
              await supabase.from('merchant_menu_item_images').insert([{
                menu_item_id: menuItemInternalId,
                image_url: newUrl,
                is_primary: true,
                display_order: 0,
              }])
            }
          } catch (imgErr) {
            console.error('[menu-items PATCH] merchant_menu_item_images replace error', imgErr)
          }
        }
      }
    }

    const customizations = Array.isArray(body.customizations) ? body.customizations : []
    const variants = Array.isArray(body.variants) ? body.variants : []
    const syncOptions = customizations.length > 0 || variants.length > 0

    if (syncOptions) {
      let menuItemInternalId = data?.id
      if (menuItemInternalId == null) {
        const { data: row } = await supabase
          .from('merchant_menu_items')
          .select('id')
          .eq('item_id', String(itemId))
          .eq('store_id', store.id)
          .single()
        menuItemInternalId = row?.id
      }
      if (menuItemInternalId == null) {
        return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
      }

      await supabase.from('merchant_menu_item_customizations').delete().eq('menu_item_id', menuItemInternalId)
      await supabase.from('merchant_menu_item_variants').delete().eq('menu_item_id', menuItemInternalId)

      for (let i = 0; i < customizations.length; i++) {
        const c = customizations[i]
        const { data: newCust, error: custErr } = await supabase
          .from('merchant_menu_item_customizations')
          .insert([{
            menu_item_id: menuItemInternalId,
            customization_id: `GMC-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
            customization_title: c.customization_title ?? '',
            customization_type: c.customization_type ?? null,
            is_required: c.is_required ?? false,
            min_selection: c.min_selection ?? 0,
            max_selection: c.max_selection ?? 1,
            display_order: c.display_order ?? i,
          }])
          .select()
          .single()
        if (custErr) continue
        const addons = Array.isArray(c.addons) ? c.addons : []
        for (let j = 0; j < addons.length; j++) {
          const a = addons[j]
          await supabase.from('merchant_menu_item_addons').insert([{
            customization_id: newCust.id,
            addon_id: `GMA-${Date.now()}-${j}-${Math.random().toString(36).slice(2, 9)}`,
            addon_name: a.addon_name ?? '',
            addon_price: a.addon_price ?? 0,
            in_stock: a.in_stock ?? true,
            display_order: a.display_order ?? j,
          }])
        }
      }
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        const variantPrice = typeof v.variant_price === 'number' ? v.variant_price : Number(v.variant_price) || 0
        await supabase.from('merchant_menu_item_variants').insert([{
          menu_item_id: menuItemInternalId,
          variant_id: `GMV-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          variant_name: v.variant_name ?? '',
          variant_type: v.variant_type ?? null,
          variant_price: variantPrice,
          display_order: i,
        }])
      }
      if (!data) {
        const { data: itemRow } = await supabase
          .from('merchant_menu_items')
          .select('*')
          .eq('id', menuItemInternalId)
          .single()
        data = itemRow
      }
    }

    if (!data) {
      const { data: itemRow } = await supabase
        .from('merchant_menu_items')
        .select('*')
        .eq('item_id', String(itemId))
        .eq('store_id', store.id)
        .single()
      data = itemRow
    }
    try {
      await logStoreActivity({
        storeId: store.id,
        section: 'menu_item',
        action: 'update',
        entityId: data?.id ?? null,
        entityName: body.item_name ?? data?.item_name ?? null,
        summary: `Merchant updated item "${body.item_name ?? data?.item_name ?? itemId}"`,
        actorType: 'merchant',
      });
    } catch (_) {}

    return NextResponse.json(data ?? {})
  } catch (err: unknown) {
    console.error('[menu-items PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
