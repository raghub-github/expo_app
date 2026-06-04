/**
 * Modifier options under a group. GET/POST /api/merchant/modifier-groups/[groupId]/options?storeId=XXX
 * Uses option_code column.
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

function genId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const modifierGroupId = parseInt((await params).groupId, 10)
  if (!Number.isFinite(modifierGroupId)) {
    return NextResponse.json({ success: false, error: 'Invalid group id' }, { status: 400 })
  }
  const { data: group } = await supabase
    .from('merchant_modifier_groups')
    .select('id')
    .eq('id', modifierGroupId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!group) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  const { data: rows, error } = await supabase
    .from('merchant_modifier_options')
    .select('id, option_code, name, price_delta, image_url, in_stock, default_quantity, display_order')
    .eq('modifier_group_id', modifierGroupId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('[GET /api/merchant/modifier-groups/[groupId]/options]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  const options = (rows ?? []).map((o: any) => ({ ...o, option_id: o.option_code ?? o.option_id }))
  return NextResponse.json({ success: true, options })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const modifierGroupId = parseInt((await params).groupId, 10)
  if (!Number.isFinite(modifierGroupId)) {
    return NextResponse.json({ success: false, error: 'Invalid group id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })
  }
  const price_delta = Number(body.price_delta)
  if (!Number.isFinite(price_delta) || price_delta < 0) {
    return NextResponse.json({ success: false, error: 'Invalid price_delta' }, { status: 400 })
  }
  const { data: group } = await supabase
    .from('merchant_modifier_groups')
    .select('id')
    .eq('id', modifierGroupId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!group) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  const optionCode = genId('MO_')
  const { data, error } = await supabase
    .from('merchant_modifier_options')
    .insert({
      modifier_group_id: modifierGroupId,
      option_code: optionCode,
      name,
      price_delta,
      image_url: body.image_url ?? null,
      in_stock: body.in_stock ?? true,
      default_quantity: body.default_quantity ?? 0,
      display_order: body.display_order ?? 0,
    })
    .select('id, option_code')
    .single()
  if (error) {
    console.error('[POST /api/merchant/modifier-groups/[groupId]/options]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  const code = (data as any)?.option_code ?? (data as any)?.option_id

  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'create',
      entityId: data?.id ?? null,
      entityName: name,
      summary: `Merchant added option "${name}" to modifier group #${modifierGroupId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, id: data?.id, option_id: code }, { status: 201 })
}
