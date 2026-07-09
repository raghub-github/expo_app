import { NextResponse } from 'next/server'
import {
  ALLOWED_USER_APP_STORE_TYPES,
  fetchUserAppCategories,
} from '@/lib/server/fetchUserAppCategories'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Short browser/CDN cache so /order Top Picks feel instant on repeat visits. */
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
}

/**
 * GET /api/user-app-categories?store_type=FOOD
 * Same source as customer app GET /v1/user-app/categories (backend → user_app_category).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const storeType = (searchParams.get('store_type') || 'FOOD').trim().toUpperCase()

    if (!ALLOWED_USER_APP_STORE_TYPES.has(storeType)) {
      return NextResponse.json([], { headers: CACHE_HEADERS })
    }

    const tiles = await fetchUserAppCategories(storeType)
    return NextResponse.json(tiles, {
      headers: { 'Content-Type': 'application/json', ...CACHE_HEADERS },
    })
  } catch (err) {
    console.error('[GET /api/user-app-categories]', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }
}
