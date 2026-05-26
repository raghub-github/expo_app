/**
 * Single modifier group. GET/PUT/DELETE /api/merchant/modifier-groups/[groupId]?storeId=XXX
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const groupId = parseInt((await params).groupId, 10)
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ success: false, error: 'Invalid group id' }, { status: 400 })
  }
  const { data: g, error } = await supabase
    .from('merchant_modifier_groups')
    .select('id, group_code, title, description, is_required, min_selection, max_selection, display_order')
    .eq('id', groupId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (error || !g) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  return NextResponse.json({
    success: true,
    group: { ...g, group_id: (g as any).group_code ?? (g as any).group_id },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const groupId = parseInt((await params).groupId, 10)
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ success: false, error: 'Invalid group id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { data: existing, error: fetchErr } = await supabase
    .from('merchant_modifier_groups')
    .select('title, description, is_required, min_selection, max_selection, display_order')
    .eq('id', groupId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  const e = existing as any
  const title = body.title !== undefined ? String(body.title).trim() : e.title
  if (!title) {
    return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
  }
  const { error: updateErr } = await supabase
    .from('merchant_modifier_groups')
    .update({
      title,
      description: body.description !== undefined ? body.description : e.description,
      is_required: body.is_required !== undefined ? body.is_required : e.is_required,
      min_selection: body.min_selection !== undefined ? body.min_selection : e.min_selection,
      max_selection: body.max_selection !== undefined ? body.max_selection : e.max_selection,
      display_order: body.display_order !== undefined ? body.display_order : e.display_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', groupId)
    .eq('store_id', access.storeIdNum)
  if (updateErr) {
    console.error('[PUT /api/merchant/modifier-groups/[groupId]]', updateErr.message)
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'update',
      entityId: groupId,
      entityName: title,
      summary: `Merchant updated modifier group #${groupId} "${title}"`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const groupId = parseInt((await params).groupId, 10)
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ success: false, error: 'Invalid group id' }, { status: 400 })
  }
  const { data: row } = await supabase
    .from('merchant_modifier_groups')
    .select('id')
    .eq('id', groupId)
    .eq('store_id', access.storeIdNum)
    .single()
  if (!row) {
    return NextResponse.json({ success: false, error: 'Modifier group not found' }, { status: 404 })
  }
  const { error } = await supabase
    .from('merchant_modifier_groups')
    .delete()
    .eq('id', groupId)
  if (error) {
    console.error('[DELETE /api/merchant/modifier-groups/[groupId]]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'delete',
      entityId: groupId,
      summary: `Merchant deleted modifier group #${groupId}`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, ok: true })
}
