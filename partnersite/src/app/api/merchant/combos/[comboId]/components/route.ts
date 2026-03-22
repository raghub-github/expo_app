/**
 * Combo components. POST /api/merchant/combos/[comboId]/components?storeId=XXX
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'
import { logStoreActivity } from '@/lib/store-activity-feed'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ comboId: string }> }
) {
  const { comboId } = await params
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const cId = parseInt(comboId, 10)
  if (!Number.isFinite(cId)) {
    return NextResponse.json({ success: false, error: 'Invalid combo id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const menu_item_id = Number(body.menu_item_id)
  if (!Number.isFinite(menu_item_id)) {
    return NextResponse.json({ success: false, error: 'menu_item_id required' }, { status: 400 })
  }
  const [comboRes, itemRes] = await Promise.all([
    supabase.from('merchant_menu_combos').select('id').eq('id', cId).eq('store_id', access.storeIdNum).single(),
    supabase.from('merchant_menu_items').select('id').eq('id', menu_item_id).eq('store_id', access.storeIdNum).single(),
  ])
  if (comboRes.error || !comboRes.data) {
    return NextResponse.json({ success: false, error: 'Combo not found' }, { status: 404 })
  }
  if (itemRes.error || !itemRes.data) {
    return NextResponse.json({ success: false, error: 'Menu item not found' }, { status: 404 })
  }
  const variant_id = body.variant_id != null ? Number(body.variant_id) : null
  const { data, error } = await supabase
    .from('merchant_menu_combo_components')
    .insert({
      combo_id: cId,
      menu_item_id,
      variant_id,
      quantity: body.quantity ?? 1,
      display_order: body.display_order ?? 0,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[POST /api/merchant/combos/[comboId]/components]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'combo_component',
      action: 'create',
      entityId: data?.id ?? null,
      summary: `Merchant added component (item #${menu_item_id}) to combo #${cId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  // Backend-derived combo_price: SUM(menu_item.selling_price * quantity)
  try {
    const { data: components } = await supabase
      .from('merchant_menu_combo_components')
      .select('menu_item_id, quantity')
      .eq('combo_id', cId)

    const comps = components ?? []
    const menuItemIds = Array.from(
      new Set(
        comps
          .map((c: any) => Number(c.menu_item_id))
          .filter((n: number) => Number.isFinite(n))
      )
    )

    let derivedPrice = 0
    if (menuItemIds.length) {
      const { data: items } = await supabase
        .from('merchant_menu_items')
        .select('id, selling_price')
        .in('id', menuItemIds)
        .eq('store_id', access.storeIdNum)

      const priceById = new Map(
        (items ?? []).map((it: any) => [Number(it.id), Number(it.selling_price) || 0])
      )

      for (const comp of comps) {
        const mid = Number((comp as any).menu_item_id)
        const qty = Number((comp as any).quantity) || 1
        derivedPrice += (priceById.get(mid) ?? 0) * qty
      }
    }

    await supabase
      .from('merchant_menu_combos')
      .update({ combo_price: derivedPrice })
      .eq('id', cId)
      .eq('store_id', access.storeIdNum)
  } catch (err) {
    console.error('[POST /api/merchant/combos/[comboId]/components] combo_price recompute failed', err)
  }

  return NextResponse.json({ success: true, id: data?.id }, { status: 201 })
}
