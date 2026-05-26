import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertStoreAccess } from '@/lib/auth/assert-store-access'

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
    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    const access = await assertStoreAccess(storeId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const { count: itemImages } = await supabase
      .from('merchant_menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', access.storeIdNum)
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
