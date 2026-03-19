/**
 * Single combo. GET/PUT/DELETE /api/merchant/combos/[comboId]?storeId=XXX
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

export async function GET(
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
  const { data: combo, error: comboError } = await supabase
    .from('merchant_menu_combos')
    .select('id, combo_name, description, combo_price, image_url, is_active, is_deleted, display_order')
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (comboError || !combo) {
    return NextResponse.json({ success: false, error: 'Combo not found' }, { status: 404 })
  }
  const { data: components } = await supabase
    .from('merchant_menu_combo_components')
    .select('id, menu_item_id, variant_id, quantity, display_order')
    .eq('combo_id', cId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
  return NextResponse.json({ success: true, combo: { ...combo, components: components ?? [] } })
}

export async function PUT(
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
  const { data: existing, error: fetchErr } = await supabase
    .from('merchant_menu_combos')
    .select('combo_name, description, combo_price, image_url, is_active, display_order')
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ success: false, error: 'Combo not found' }, { status: 404 })
  }
  const combo_name = body.combo_name !== undefined ? String(body.combo_name).trim() : (existing as any).combo_name
  if (!combo_name) {
    return NextResponse.json({ success: false, error: 'combo_name required' }, { status: 400 })
  }
  const { error: updateErr } = await supabase
    .from('merchant_menu_combos')
    .update({
      combo_name,
      description: body.description !== undefined ? body.description : (existing as any).description,
      // combo_price is calculated from combo components; keep existing value here
      image_url: body.image_url !== undefined ? body.image_url : (existing as any).image_url,
      is_active: body.is_active !== undefined ? body.is_active : (existing as any).is_active,
      display_order: body.display_order !== undefined ? body.display_order : (existing as any).display_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
  if (updateErr) {
    console.error('[PUT /api/merchant/combos/[comboId]]', updateErr.message)
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'combo',
      action: 'update',
      entityId: cId,
      entityName: combo_name,
      summary: `Merchant updated combo #${cId} "${combo_name}"`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}

export async function DELETE(
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
  const { data: row } = await supabase
    .from('merchant_menu_combos')
    .select('id')
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!row) {
    return NextResponse.json({ success: false, error: 'Combo not found' }, { status: 404 })
  }
  const { error } = await supabase
    .from('merchant_menu_combos')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', cId)
    .eq('store_id', access.storeIdNum)
  if (error) {
    console.error('[DELETE /api/merchant/combos/[comboId]]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'combo',
      action: 'delete',
      entityId: cId,
      summary: `Merchant deleted combo #${cId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}
