import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizeCategoryImageUrl } from '@/lib/normalizeCategoryImageUrl'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

/**
 * GET /api/user-app-categories?store_type=FOOD
 * Reads public.user_app_category: active rows, ordered by display_order.
 * Response shape matches order page grid: { id, name, img }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const storeType = (searchParams.get('store_type') || 'FOOD').toUpperCase()

    const { data, error } = await supabase
      .from('user_app_category')
      .select('id, name, image_url, display_order')
      .eq('status', 'active')
      .eq('store_type', storeType)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      console.error('[GET /api/user-app-categories]', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch categories', details: error.message },
        { status: 500, headers: NO_CACHE_HEADERS }
      )
    }

    const rows = data || []
    const result = rows
      .map((row: { id: number | string; name: string; image_url: string | null }) => {
        const name = (row.name || '').trim()
        const img = normalizeCategoryImageUrl(row.image_url)
        return {
          id: String(row.id),
          name,
          img,
        }
      })
      .filter((c: { name: string }) => Boolean(c.name))

    return NextResponse.json(result, {
      headers: { 'Content-Type': 'application/json', ...NO_CACHE_HEADERS },
    })
  } catch (err) {
    console.error('[GET /api/user-app-categories]', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
