import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG === '1'
function log(...args: unknown[]) {
  if (DEBUG) console.log('[GET /api/menu-categories]', new Date().toISOString(), ...args)
}

/**
 * GET /api/menu-categories
 * Fetches ONLY from merchant_menu_categories table – no fallback, no static data.
 * Returns distinct category_name + category_image_url for is_active = true rows.
 */
export async function GET() {
  try {
    log('Fetching merchant_menu_categories (is_active=true)')
    const { data: categories, error: catError } = await supabase
      .from('merchant_menu_categories')
      .select('category_name, category_image_url, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('category_name', { ascending: true })

    if (catError) {
      log('Supabase error:', catError.message)
      return NextResponse.json(
        { error: 'Failed to fetch categories', details: catError.message },
        { status: 500 },
        { headers: NO_CACHE_HEADERS }
      )
    }

    const rows = categories || []
    log('Raw rows from merchant_menu_categories:', rows.length)
    const seen = new Map<string, { name: string; img: string | null }>()
    for (const row of rows) {
      const r = row as { category_name: string; category_image_url: string | null }
      const name = (r.category_name || '').trim()
      if (!name || seen.has(name)) continue
      seen.set(name, {
        name,
        img: toAbsoluteImageUrl(r.category_image_url) ?? null,
      })
    }

    const result = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
    log('Returning', result.length, 'distinct categories:', result.map(c => c.name))
    return NextResponse.json(result, {
      headers: { 'Content-Type': 'application/json', ...NO_CACHE_HEADERS },
    })
  } catch (err) {
    log('Unhandled error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
