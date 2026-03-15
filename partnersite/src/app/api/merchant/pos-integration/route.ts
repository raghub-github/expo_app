import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * GET /api/merchant/pos-integration?storeId=GMMxxxx
 * Returns { active: boolean, pos_partner?, pos_store_id?, status? } for dashboard mode switch.
 */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 })
  }
  const { data: store } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeId)
    .single()
  if (!store?.id) {
    return NextResponse.json({ active: false })
  }
  const { data: row } = await supabase
    .from('merchant_store_pos_integration')
    .select('status, pos_partner, pos_store_id')
    .eq('store_id', store.id)
    .single()
  const active = row?.status === 'ACTIVE'
  return NextResponse.json({
    active,
    pos_partner: row?.pos_partner ?? null,
    pos_store_id: row?.pos_store_id ?? null,
    status: row?.status ?? null,
  })
}

/**
 * POST /api/merchant/pos-integration
 * Body: { storeId, pos_partner, pos_store_id? }
 * Upserts POS config; status set to PENDING until partner initiates (then backend can set ACTIVE).
 * For demo, we set ACTIVE when pos_partner is provided so merchant can switch immediately after registration.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      )
    }
    const body = await req.json().catch(() => ({}))
    const storeId = body.storeId ?? body.store_id
    const pos_partner = body.pos_partner ?? body.posPartner
    const pos_store_id = body.pos_store_id ?? body.posStoreId ?? null
    if (!storeId || !pos_partner || typeof pos_partner !== 'string' || !pos_partner.trim()) {
      return NextResponse.json(
        { success: false, error: 'storeId and pos_partner are required' },
        { status: 400 }
      )
    }
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single()
    if (!store?.id) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
    }
    const now = new Date().toISOString()
    const { error: upsertError } = await supabase
      .from('merchant_store_pos_integration')
      .upsert(
        {
          store_id: store.id,
          pos_partner: pos_partner.trim(),
          pos_store_id: pos_store_id ? String(pos_store_id).trim() : null,
          status: 'PENDING',
          updated_at: now,
        },
        { onConflict: 'store_id' }
      )
    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      status: 'PENDING',
      message: 'POS registration saved. Ask your POS partner to initiate integration; once active, you can switch to POS mode on the dashboard.',
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/merchant/pos-integration?storeId=xxx&status=ACTIVE
 * Sets integration status (e.g. ACTIVE when partner has initiated). Requires merchant auth.
 * Used by webhook or support; for demo merchant can call after partner confirms.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      )
    }
    const storeId = req.nextUrl.searchParams.get('storeId')
    const status = req.nextUrl.searchParams.get('status')
    if (!storeId || !status || !['PENDING', 'ACTIVE', 'DISABLED'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'storeId and status (PENDING|ACTIVE|DISABLED) required' },
        { status: 400 }
      )
    }
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id')
      .eq('store_id', storeId)
      .single()
    if (!store?.id) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
    }
    const { error: updateError } = await supabase
      .from('merchant_store_pos_integration')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'ACTIVE' ? { activated_at: new Date().toISOString() } : {}),
      })
      .eq('store_id', store.id)
    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, status })
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
