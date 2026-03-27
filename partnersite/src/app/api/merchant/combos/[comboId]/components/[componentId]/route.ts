/**
 * Delete combo component. DELETE /api/merchant/combos/[comboId]/components/[componentId]?storeId=XXX
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ comboId: string; componentId: string }> }
) {
  const { comboId, componentId } = await params
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const cId = parseInt(comboId, 10)
  const compId = parseInt(componentId, 10)
  if (!Number.isFinite(cId) || !Number.isFinite(compId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }
  const { data: combo } = await supabase
    .from('merchant_menu_combos')
    .select('id')
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!combo) {
    return NextResponse.json({ success: false, error: 'Combo not found' }, { status: 404 })
  }
  const { data: comp } = await supabase
    .from('merchant_menu_combo_components')
    .select('id')
    .eq('id', compId)
    .eq('combo_id', cId)
    .single()
  if (!comp) {
    return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 })
  }
  const { error } = await supabase
    .from('merchant_menu_combo_components')
    .delete()
    .eq('id', compId)
  if (error) {
    console.error('[DELETE /api/merchant/combos/.../components/[componentId]]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'combo_component',
      action: 'delete',
      entityId: compId,
      summary: `Merchant removed component #${compId} from combo #${cId}`,
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
    console.error('[DELETE /api/merchant/combos/.../components/[componentId]] combo_price recompute failed', err)
  }

  return NextResponse.json({ success: true, ok: true })
}
