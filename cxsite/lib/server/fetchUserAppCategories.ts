import { and, asc, eq } from 'drizzle-orm'
import { userAppCategory } from '@/db/userAppCategoryTable'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import { getGatimitraBackendUrl } from '@/lib/server/gatimitraBackendUrl'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { supabase } from '@/lib/supabase'

export type UserAppCategoryTile = { id: string; name: string; img: string | null }

const UPSTREAM_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 12_000 : 4_000

export const ALLOWED_USER_APP_STORE_TYPES = new Set([
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

function mapBackendItems(
  items: Array<{
    id?: number
    name?: string
    imageUrl?: string | null
    displayOrder?: number
  }>
): UserAppCategoryTile[] {
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
    .filter((c): c is UserAppCategoryTile => c != null)
    .sort((a, b) => {
      const ao = items.find((i) => String(i.id) === a.id)?.displayOrder ?? 0
      const bo = items.find((i) => String(i.id) === b.id)?.displayOrder ?? 0
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name)
    })
}

async function fetchFromBackend(storeType: string): Promise<UserAppCategoryTile[] | null> {
  try {
    const upstream = await fetch(
      `${getGatimitraBackendUrl()}/v1/user-app/categories?store_type=${encodeURIComponent(storeType)}`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }
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
  } catch (err) {
    console.warn('[fetchUserAppCategories] upstream failed:', err)
    return null
  }
}

async function fetchFromSupabase(storeType: string): Promise<UserAppCategoryTile[] | null> {
  try {
    const db = getSupabaseServiceRole() ?? supabase
    const { data, error } = await db
      .from('user_app_category')
      .select('id, name, image_url, display_order')
      .eq('store_type', storeType)
      .eq('status', 'active')
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      console.warn('[fetchUserAppCategories] Supabase fallback failed:', error.message)
      return null
    }

    return (data ?? [])
      .map((row) => {
        const name = (row.name ?? '').trim()
        if (!name) return null
        return {
          id: String(row.id),
          name,
          img: resolveAppAssetUrl((row.image_url as string | null) ?? null),
        }
      })
      .filter((c): c is UserAppCategoryTile => c != null)
  } catch (err) {
    console.warn('[fetchUserAppCategories] Supabase fallback error:', err)
    return null
  }
}

async function fetchFromDatabase(storeType: string): Promise<UserAppCategoryTile[] | null> {
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
        and(eq(userAppCategory.storeType, storeType), eq(userAppCategory.status, 'active'))
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
      .filter((c): c is UserAppCategoryTile => c != null)
  } catch (err) {
    console.error('[fetchUserAppCategories] DB fallback failed:', err)
    return null
  }
}

/**
 * Same source as customer app GET /v1/user-app/categories → `user_app_category`.
 * Prefer backend, then Postgres, then Supabase.
 */
export async function fetchUserAppCategories(
  storeType = 'FOOD'
): Promise<UserAppCategoryTile[]> {
  const type = storeType.trim().toUpperCase() || 'FOOD'
  if (!ALLOWED_USER_APP_STORE_TYPES.has(type)) return []

  const fromBackend = await fetchFromBackend(type)
  if (fromBackend != null) return fromBackend

  const fromDb = await fetchFromDatabase(type)
  if (fromDb != null) return fromDb

  const fromSupabase = await fetchFromSupabase(type)
  if (fromSupabase != null) return fromSupabase

  return []
}
