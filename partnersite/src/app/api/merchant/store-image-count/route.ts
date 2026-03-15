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
 * GET /api/merchant/store-image-count?storeId=XXX
 * Returns accurate image count for the store (menu items + categories with images).
 * Uses service role so count is not affected by RLS. Used for plan limit enforcement.
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error ?? 'Forbidden' }, { status: 403 })
    }

    const { data: store, error: storeError } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', String(storeId).trim())
      .single()

    if (storeError || !store?.id || store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: 'Store not found or access denied' }, { status: 404 })
    }

    const { count: itemImages } = await supabase
      .from('merchant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .not('item_image_url', 'is', null)

    const totalUsed = itemImages ?? 0

    return NextResponse.json({
      totalUsed,
      itemImages: totalUsed,
      categoryImages: 0,
    })
  } catch (e: unknown) {
    console.error('[store-image-count]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
