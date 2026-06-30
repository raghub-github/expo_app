import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { userAppCategory } from '@/db/userAppCategoryTable'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BACKEND_URL =
  process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'https://api.gatimitra.com'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

const ALLOWED_STORE_TYPES = new Set([
  'GENERAL',
  'FOOD',
  'GROCERY',
  'RESTAURANT',
  'CLOUD_KITCHEN',
  'WAREHOUSE',
  'STORE',
  'GARAGE',
  'PHARMA',
  'STATIONERY',
  'CAFE',
  'BAKERY',
  'OTHERS',
  'FASHION',
])

type CategoryTile = { id: string; name: string; img: string | null }

function mapBackendItems(
  items: Array<{
    id?: number
    name?: string
    imageUrl?: string | null
    displayOrder?: number
  }>
): CategoryTile[] {
  return items
    .map((row) => {
      const name = (row.name ?? '').trim()
      if (!name) return null
      return {
        id: String(row.id ?? name),
        name,
        img: resolveAppAssetUrl(row.imageUrl ?? null),
      }
    })
    .filter((c): c is CategoryTile => c != null)
    .sort((a, b) => {
      const ao = items.find((i) => String(i.id) === a.id)?.displayOrder ?? 0
      const bo = items.find((i) => String(i.id) === b.id)?.displayOrder ?? 0
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name)
    })
}

async function fetchFromBackend(storeType: string): Promise<CategoryTile[] | null> {
  try {
    const upstream = await fetch(
      `${BACKEND_URL}/v1/user-app/categories?store_type=${encodeURIComponent(storeType)}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000) }
    )
    if (!upstream.ok) return null

    const data = (await upstream.json()) as {
      items?: Array<{
        id: number
        name: string
        imageUrl: string | null
        displayOrder: number
      }>
    }
    if (!Array.isArray(data.items)) return []
    return mapBackendItems(data.items)
  } catch {
    return null
  }
}

async function fetchFromDatabase(storeType: string): Promise<CategoryTile[] | null> {
  if (!isCustomersDbConfigured()) return null
  const db = getDb()
  if (!db) return null

  try {
    const rows = await db
      .select({
        id: userAppCategory.id,
        name: userAppCategory.name,
        imageUrl: userAppCategory.imageUrl,
        displayOrder: userAppCategory.displayOrder,
      })
      .from(userAppCategory)
      .where(
        and(
          eq(userAppCategory.storeType, storeType),
          eq(userAppCategory.status, 'active')
        )
      )
      .orderBy(asc(userAppCategory.displayOrder), asc(userAppCategory.id))

    return rows
      .map((row) => {
        const name = (row.name ?? '').trim()
        if (!name) return null
        return {
          id: String(row.id),
          name,
          img: resolveAppAssetUrl(row.imageUrl ?? null),
        }
      })
      .filter((c): c is CategoryTile => c != null)
  } catch (err) {
    console.error('[GET /api/user-app-categories] DB fallback failed:', err)
    return null
  }
}

/**
 * GET /api/user-app-categories?store_type=FOOD
 * Same source as customer app GET /v1/user-app/categories (backend → user_app_category).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const storeType = (searchParams.get('store_type') || 'FOOD').trim().toUpperCase()

    if (!ALLOWED_STORE_TYPES.has(storeType)) {
      return NextResponse.json([], { headers: NO_CACHE_HEADERS })
    }

    const fromBackend = await fetchFromBackend(storeType)
    if (fromBackend != null) {
      return NextResponse.json(fromBackend, {
        headers: { 'Content-Type': 'application/json', ...NO_CACHE_HEADERS },
      })
    }

    const fromDb = await fetchFromDatabase(storeType)
    if (fromDb != null) {
      return NextResponse.json(fromDb, {
        headers: { 'Content-Type': 'application/json', ...NO_CACHE_HEADERS },
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 502, headers: NO_CACHE_HEADERS }
    )
  } catch (err) {
    console.error('[GET /api/user-app-categories]', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
