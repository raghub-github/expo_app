/**
 * Delete combo component. DELETE /api/merchant/combos/[comboId]/components/[componentId]?storeId=XXX
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'

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
  return NextResponse.json({ success: true, ok: true })
}
