/**
 * Addon library (modifier groups). GET/POST /api/merchant/modifier-groups?storeId=XXX
 * Same logic as dashboard; uses group_code column.
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

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const { data: groups, error: gErr } = await supabase
    .from('merchant_modifier_groups')
    .select('id, group_code, title, description, is_required, min_selection, max_selection, display_order')
    .eq('store_id', access.storeIdNum)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
  if (gErr) {
    console.error('[GET /api/merchant/modifier-groups]', gErr.message)
    return NextResponse.json({ success: false, error: gErr.message }, { status: 500 })
  }
  const result = await Promise.all(
    (groups ?? []).map(async (g: any) => {
      const [{ count: optCount }, { count: useCount }] = await Promise.all([
        supabase.from('merchant_modifier_options').select('id', { count: 'exact', head: true }).eq('modifier_group_id', g.id),
        supabase.from('merchant_item_modifier_groups').select('id', { count: 'exact', head: true }).eq('modifier_group_id', g.id),
      ])
      return {
        ...g,
        group_id: g.group_code ?? g.group_id,
        options_count: optCount ?? 0,
        used_in_items_count: useCount ?? 0,
      }
    })
  )
  return NextResponse.json({ success: true, modifierGroups: result })
}

export async function POST(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const title = String(body.title ?? '').trim()
  if (!title) {
    return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
  }
  const groupCode = genId('MG_')
  const { data, error } = await supabase
    .from('merchant_modifier_groups')
    .insert({
      store_id: access.storeIdNum,
      group_code: groupCode,
      title,
      description: body.description ?? null,
      is_required: body.is_required ?? false,
      min_selection: body.min_selection ?? 0,
      max_selection: body.max_selection ?? 1,
      display_order: body.display_order ?? 0,
    })
    .select('id, group_code')
    .single()
  if (error) {
    console.error('[POST /api/merchant/modifier-groups]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  const code = (data as any)?.group_code ?? (data as any)?.group_id

  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'addon',
      action: 'create',
      entityId: data?.id ?? null,
      entityName: title,
      summary: `Merchant created modifier group "${title}"`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, id: data?.id, group_id: code }, { status: 201 })
}
