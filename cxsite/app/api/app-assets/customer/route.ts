import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { appStaticAssets } from '@/db/appStaticAssetsTable'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { resolveAppAssetUrl } from '@/lib/resolveAppAssetUrl'
import { readUpstreamJson } from '@/lib/server/safeUpstreamJson'
import { getGatimitraBackendUrl } from '@/lib/server/gatimitraBackendUrl'

export const dynamic = 'force-dynamic'

const BACKEND_URL = getGatimitraBackendUrl()
const UPSTREAM_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 12_000 : 5_000
const DB_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 8_000 : 3_000

type AssetItem = {
  id: string
  section: string
  label: string
  description: string
  proxyUrl: string | null
  url: string | null
  sortOrder: number
}

type Payload = {
  app: 'customer'
  assets: Record<string, AssetItem>
  items: AssetItem[]
}

declare global {
  // eslint-disable-next-line no-var
  var __cxsite_app_assets_cache:
    | { at: number; payload: Payload }
    | undefined
}

const MEMORY_TTL_MS = 60_000

function buildPayload(items: AssetItem[]): Payload {
  const assets: Record<string, AssetItem> = {}
  for (const item of items) {
    const shortKey = item.id.startsWith('customer.')
      ? item.id.slice('customer.'.length)
      : item.id
    assets[shortKey] = item
  }
  return { app: 'customer', assets, items }
}

async function fetchFromDatabase(): Promise<Payload | null> {
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

    if (items.length === 0) return null
    return buildPayload(items)
  } catch (err) {
    console.error('[GET /api/app-assets/customer] DB fallback failed:', err)
    return null
  }
}

async function fetchFromBackend(): Promise<Payload | null> {
  try {
    const upstream = await fetch(`${BACKEND_URL}/v1/app-assets/customer`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!upstream.ok) return null
    const data = await readUpstreamJson<{
      app?: string
      assets?: Record<string, AssetItem>
      items?: AssetItem[]
    }>(upstream)
    if (!data?.assets || !data.items?.length) return null
    return { app: 'customer', assets: data.assets, items: data.items }
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** Public — same payload as GET /v1/app-assets/customer (cached, DB+backend race). */
export async function GET() {
  const cached = globalThis.__cxsite_app_assets_cache
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }

  // Prefer whichever answers first so logos aren't blocked by a saturated DB pool.
  const [fromDb, fromBackend] = await Promise.all([
    withTimeout(fetchFromDatabase(), DB_TIMEOUT_MS),
    fetchFromBackend(),
  ])

  const payload = fromDb ?? fromBackend
  if (payload) {
    globalThis.__cxsite_app_assets_cache = { at: Date.now(), payload }
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }

  return NextResponse.json({ error: 'App assets unavailable' }, { status: 502 })
}
