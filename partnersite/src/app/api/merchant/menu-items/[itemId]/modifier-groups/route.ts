/**
 * Item ↔ modifier group linking. GET/POST /api/merchant/menu-items/[itemId]/modifier-groups?storeId=XXX
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const menuItemId = parseInt((await params).itemId, 10)
  if (!Number.isFinite(menuItemId)) {
    return NextResponse.json({ success: false, error: 'Invalid item id' }, { status: 400 })
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
  const { data: links } = await supabase
    .from('merchant_item_modifier_groups')
    .select('id, modifier_group_id, display_order')
    .eq('menu_item_id', menuItemId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
  const result: any[] = []
  for (const link of links ?? []) {
    const { data: g } = await supabase
      .from('merchant_modifier_groups')
      .select('id, group_code, title, description, is_required, min_selection, max_selection')
      .eq('id', link.modifier_group_id)
      .eq('store_id', access.storeIdNum)
      .single()
    if (!g) continue
    const { data: opts } = await supabase
      .from('merchant_modifier_options')
      .select('id, option_code, name, price_delta, in_stock, display_order')
      .eq('modifier_group_id', link.modifier_group_id)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })
    const gAny = g as any
    result.push({
      id: link.id,
      modifier_group_id: link.modifier_group_id,
      display_order: link.display_order,
      group: {
        ...gAny,
        group_id: gAny.group_code ?? gAny.group_id,
        options: (opts ?? []).map((o: any) => ({ ...o, option_id: o.option_code ?? o.option_id })),
      },
    })
  }
  return NextResponse.json({ success: true, linkedModifierGroups: result })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const menuItemId = parseInt((await params).itemId, 10)
  if (!Number.isFinite(menuItemId)) {
    return NextResponse.json({ success: false, error: 'Invalid item id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const modifier_group_id = Number(body.modifier_group_id)
  if (!Number.isFinite(modifier_group_id)) {
    return NextResponse.json({ success: false, error: 'modifier_group_id required' }, { status: 400 })
  }
  const [{ data: item }, { data: group }] = await Promise.all([
    supabase.from('merchant_menu_items').select('id').eq('id', menuItemId).eq('store_id', access.storeIdNum).single(),
    supabase.from('merchant_modifier_groups').select('id').eq('id', modifier_group_id).eq('store_id', access.storeIdNum).single(),
  ])
  if (!item) {
    return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 })
  }
  if (!group) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  const { data: existing } = await supabase
    .from('merchant_item_modifier_groups')
    .select('id')
    .eq('menu_item_id', menuItemId)
    .eq('modifier_group_id', modifier_group_id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ success: false, error: 'Group already linked to this item' }, { status: 409 })
  }
  const { data: inserted, error } = await supabase
    .from('merchant_item_modifier_groups')
    .insert({
      menu_item_id: menuItemId,
      modifier_group_id,
      display_order: body.display_order ?? 0,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[POST /api/merchant/menu-items/[itemId]/modifier-groups]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: inserted?.id }, { status: 201 })
}
