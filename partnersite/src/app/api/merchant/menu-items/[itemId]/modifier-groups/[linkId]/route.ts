/**
 * Unlink modifier group from item. DELETE /api/merchant/menu-items/[itemId]/modifier-groups/[linkId]?storeId=XXX
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'
import { logStoreActivity } from '@/lib/store-activity-feed'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key"
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string; linkId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const menuItemId = parseInt((await params).itemId, 10)
  const linkId = parseInt((await params).linkId, 10)
  if (!Number.isFinite(menuItemId) || !Number.isFinite(linkId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 })
  }
  const { data: item } = await supabase
    .from('merchant_menu_items')
    .select('id')
    .eq('id', menuItemId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!item) {
    return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 })
  }
  const { data: link } = await supabase
    .from('merchant_item_modifier_groups')
    .select('id')
    .eq('id', linkId)
    .eq('menu_item_id', menuItemId)
    .single()
  if (!link) {
    return NextResponse.json({ success: false, error: 'Link not found' }, { status: 404 })
  }
  const { error } = await supabase
    .from('merchant_item_modifier_groups')
    .delete()
    .eq('id', linkId)
  if (error) {
    console.error('[DELETE /api/merchant/menu-items/.../modifier-groups/[linkId]]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'unlink',
      entityId: linkId,
      summary: `Merchant unlinked modifier group (link #${linkId}) from item #${menuItemId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}
