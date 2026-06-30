import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { appStaticAssets } from '@/db/appStaticAssetsTable'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import { readUpstreamJson } from '@/lib/server/safeUpstreamJson'

export const dynamic = 'force-dynamic'

const BACKEND_URL =
  process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || 'https://api.gatimitra.com'

type AssetItem = {
  id: string
  section: string
  label: string
  description: string
  proxyUrl: string | null
  url: string | null
  sortOrder: number
}

function buildPayload(items: AssetItem[]) {
  const assets: Record<string, AssetItem> = {}
  for (const item of items) {
    const shortKey = item.id.startsWith('customer.')
      ? item.id.slice('customer.'.length)
      : item.id
    assets[shortKey] = item
  }
  return { app: 'customer' as const, assets, items }
}

async function fetchFromDatabase(): Promise<ReturnType<typeof buildPayload> | null> {
  if (!isCustomersDbConfigured()) return null
  const db = getDb()
  if (!db) return null

  try {
    const rows = await db
      .select({
        id: appStaticAssets.id,
        section: appStaticAssets.section,
        label: appStaticAssets.label,
        description: appStaticAssets.description,
        proxyUrl: appStaticAssets.proxyUrl,
        sortOrder: appStaticAssets.sortOrder,
      })
      .from(appStaticAssets)
      .where(eq(appStaticAssets.app, 'customer'))
      .orderBy(asc(appStaticAssets.sortOrder), asc(appStaticAssets.id))

    const items: AssetItem[] = rows.map((row) => {
      const proxyUrl = row.proxyUrl?.trim() || null
      const resolved = resolveAppAssetUrl(proxyUrl)
      return {
        id: row.id,
        section: row.section ?? '',
        label: row.label ?? '',
        description: row.description ?? '',
        proxyUrl,
        url: resolved,
        sortOrder: row.sortOrder ?? 0,
      }
    })

    return buildPayload(items)
  } catch (err) {
    console.error('[GET /api/app-assets/customer] DB fallback failed:', err)
    return null
  }
}

async function fetchFromBackend(): Promise<ReturnType<typeof buildPayload> | null> {
  try {
    const upstream = await fetch(`${BACKEND_URL}/v1/app-assets/customer`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (!upstream.ok) return null
    const data = await readUpstreamJson<{
      app?: string
      assets?: Record<string, AssetItem>
      items?: AssetItem[]
    }>(upstream)
    if (!data?.assets || !data.items) return null
    return { app: 'customer', assets: data.assets, items: data.items }
  } catch {
    return null
  }
}

/** Public — same payload as GET /v1/app-assets/customer (DB first, then backend). */
export async function GET() {
  const fromDb = await fetchFromDatabase()
  if (fromDb) {
    return NextResponse.json(fromDb, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }

  const fromBackend = await fetchFromBackend()
  if (fromBackend) {
    return NextResponse.json(fromBackend, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }

  return NextResponse.json({ error: 'App assets unavailable' }, { status: 502 })
}
