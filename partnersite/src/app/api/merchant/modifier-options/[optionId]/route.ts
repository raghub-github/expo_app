/**
 * Single modifier option. PUT/DELETE /api/merchant/modifier-options/[optionId]?storeId=XXX
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const optId = parseInt((await params).optionId, 10)
  if (!Number.isFinite(optId)) {
    return NextResponse.json({ success: false, error: 'Invalid option id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { data: o, error: fetchErr } = await supabase
    .from('merchant_modifier_options')
    .select('id, modifier_group_id, name, price_delta, image_url, in_stock, default_quantity, display_order')
    .eq('id', optId)
    .single()
  if (fetchErr || !o) {
    return NextResponse.json({ success: false, error: 'Modifier option not found' }, { status: 404 })
  }
  const { data: g } = await supabase
    .from('merchant_modifier_groups')
    .select('id')
    .eq('id', (o as any).modifier_group_id)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!g) {
    return NextResponse.json({ success: false, error: 'Modifier option not found' }, { status: 404 })
  }
  const e = o as any
  const name = body.name !== undefined ? String(body.name).trim() : e.name
  if (!name) {
    return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })
  }
  const price_delta = body.price_delta !== undefined ? Number(body.price_delta) : Number(e.price_delta ?? 0)
  if (!Number.isFinite(price_delta) || price_delta < 0) {
    return NextResponse.json({ success: false, error: 'Invalid price_delta' }, { status: 400 })
  }
  const { error: updateErr } = await supabase
    .from('merchant_modifier_options')
    .update({
      name,
      price_delta,
      image_url: body.image_url !== undefined ? body.image_url : e.image_url,
      in_stock: body.in_stock !== undefined ? body.in_stock : e.in_stock,
      default_quantity: body.default_quantity !== undefined ? body.default_quantity : e.default_quantity,
      display_order: body.display_order !== undefined ? body.display_order : e.display_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', optId)
  if (updateErr) {
    console.error('[PUT /api/merchant/modifier-options/[optionId]]', updateErr.message)
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'update',
      entityId: optId,
      entityName: name,
      summary: `Merchant updated modifier option #${optId} "${name}"`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const optId = parseInt((await params).optionId, 10)
  if (!Number.isFinite(optId)) {
    return NextResponse.json({ success: false, error: 'Invalid option id' }, { status: 400 })
  }
  const { data: o } = await supabase
    .from('merchant_modifier_options')
    .select('id, modifier_group_id')
    .eq('id', optId)
    .single()
  if (!o) {
    return NextResponse.json({ success: false, error: 'Modifier option not found' }, { status: 404 })
  }
  const { data: g } = await supabase
    .from('merchant_modifier_groups')
    .select('id')
    .eq('id', (o as any).modifier_group_id)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!g) {
    return NextResponse.json({ success: false, error: 'Modifier option not found' }, { status: 404 })
  }
  const { error } = await supabase
    .from('merchant_modifier_options')
    .delete()
    .eq('id', optId)
  if (error) {
    console.error('[DELETE /api/merchant/modifier-options/[optionId]]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'delete',
      entityId: optId,
      summary: `Merchant deleted modifier option #${optId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}
