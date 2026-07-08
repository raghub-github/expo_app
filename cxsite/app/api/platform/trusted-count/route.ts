import { NextResponse } from 'next/server'
import { fetchPlatformTrustedCount } from '@/lib/server/fetchPlatformTrustedCount'

export const dynamic = 'force-dynamic'

const CACHE_SECONDS = 60

declare global {
  // eslint-disable-next-line no-var
  var __cxsite_trusted_count_cache:
    | { at: number; body: Awaited<ReturnType<typeof fetchPlatformTrustedCount>> }
    | undefined
}

const MEMORY_TTL_MS = 30_000

/**
 * GET /api/platform/trusted-count
 * Live total: customers + merchant_stores + riders (non-deleted).
 */
export async function GET() {
  try {
    const cached = globalThis.__cxsite_trusted_count_cache
    if (cached && Date.now() - cached.at < MEMORY_TTL_MS) {
      return NextResponse.json(cached.body, {
        headers: {
          'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=120`,
        },
      })
    }

    const counts = await fetchPlatformTrustedCount()
    globalThis.__cxsite_trusted_count_cache = { at: Date.now(), body: counts }
    return NextResponse.json(counts, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=120`,
      },
    })
  } catch (err) {
    console.error('[GET /api/platform/trusted-count]', err)
    return NextResponse.json(
      { customers: 0, merchants: 0, riders: 0, count: 0, total: 0 },
      { status: 500 }
    )
  }
}
