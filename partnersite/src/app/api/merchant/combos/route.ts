/**
 * Combos for store menu (partnersite merchant portal).
 * GET/POST /api/merchant/combos?storeId=XXX
 * Same logic as dashboard; uses merchant auth + store ownership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'
import { logStoreActivity } from '@/lib/store-activity-feed'
import { client as pgClient } from '@/lib/drizzle'
import { expireTimedMenuOutOfStockForStore } from '@/lib/menu-oos-expiry'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  await expireTimedMenuOutOfStockForStore(pgClient, access.storeIdNum)
  const { data, error } = await supabase
    .from('merchant_menu_combos')
    .select('id, combo_name, description, combo_price, image_url, is_active, is_deleted, display_order, out_of_stock_manual, out_of_stock_until')
    .eq('store_id', access.storeIdNum)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('[GET /api/merchant/combos]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, combos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const access = await assertStoreAccess(storeId)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const combo_name = String(body.combo_name ?? '').trim()
  if (!combo_name) {
    return NextResponse.json({ success: false, error: 'combo_name required' }, { status: 400 })
  }
  const combo_price = Number(body.combo_price)
  if (!Number.isFinite(combo_price) || combo_price < 0) {
    return NextResponse.json({ success: false, error: 'Valid combo_price required' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('merchant_menu_combos')
    .insert({
      store_id: access.storeIdNum,
      combo_name,
      description: body.description ?? null,
      combo_price,
      image_url: body.image_url ?? null,
      display_order: body.display_order ?? 0,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[POST /api/merchant/combos]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  try {
    await logStoreActivity({
      storeId: access.storeIdNum,
      section: 'combo',
      action: 'create',
      entityId: data?.id ?? null,
      entityName: combo_name,
      summary: `Merchant created combo "${combo_name}"`,
      actorType: 'merchant',
    });
  } catch (_) {}

  return NextResponse.json({ success: true, id: data?.id }, { status: 201 })
}
