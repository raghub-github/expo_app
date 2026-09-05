import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAttachmentFromR2,
  r2KeyFromProxySearch,
  shouldRedirectAttachmentToR2,
  signR2GetUrl,
  streamAttachmentFromR2,
} from '@/lib/server/r2AttachmentProxy'

const PARTNER_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_URL?.replace(/\/$/, '') || 'https://partner.gatimitra.com'

const BACKEND_ORIGIN = process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || ''

const UPSTREAM_TIMEOUT_MS = 8_000
const MEM_TTL_MS = 10 * 60 * 1000
const MEM_MAX = 80
const memCache = new Map<string, { body: Buffer; contentType: string; exp: number }>()

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
}

const REDIRECT_HEADERS = {
  'Cache-Control': 'private, max-age=300',
}

function remember(key: string, body: Buffer, contentType: string) {
  if (body.length > 2_000_000) return
  if (memCache.size >= MEM_MAX) {
    const first = memCache.keys().next().value
    if (first) memCache.delete(first)
  }
  memCache.set(key, { body, contentType, exp: Date.now() + MEM_TTL_MS })
}

function fromMemory(key: string): { body: Buffer; contentType: string } | null {
  const hit = memCache.get(key)
  if (!hit) return null
  if (hit.exp < Date.now()) {
    memCache.delete(key)
    return null
  }
  return hit
}

function upstreamProxyUrls(search: string): string[] {
  const upstreams: string[] = []
  if (BACKEND_ORIGIN) {
    upstreams.push(`${BACKEND_ORIGIN}/v1/attachments/proxy${search}`)
  }
  upstreams.push(`${PARTNER_ORIGIN}/api/attachments/proxy${search}`)
  return upstreams
}

async function redirectToSignedOrUpstream(search: string, key: string): Promise<NextResponse | null> {
  const signed = await signR2GetUrl(key)
  if (signed) {
    const res = NextResponse.redirect(signed, 302)
    res.headers.set('Cache-Control', REDIRECT_HEADERS['Cache-Control'])
    return res
  }

  for (const target of upstreamProxyUrls(search)) {
    try {
      const upstream = await fetch(target, {
        headers: { Accept: 'image/*,*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(4_000),
      })
      const loc = upstream.headers.get('location')
      if (loc && upstream.status >= 300 && upstream.status < 400) {
        const res = NextResponse.redirect(loc, 302)
        res.headers.set('Cache-Control', REDIRECT_HEADERS['Cache-Control'])
        return res
      }
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Serves store/menu/gallery images like the customer app attachment proxy.
 * Category / CMS assets 302 to R2 (they are 1–2MB — never buffer through Next).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const inline = url.searchParams.get('inline') === '1'
  url.searchParams.delete('inline')
  const search = url.search
  const cacheKey = search
  const objectKey = r2KeyFromProxySearch(search)

  try {
    if (objectKey && shouldRedirectAttachmentToR2(objectKey)) {
      if (inline) {
        const streamed = await streamAttachmentFromR2(search)
        if (streamed) {
          return new NextResponse(streamed.stream, {
            status: 200,
            headers: {
              'Content-Type': streamed.contentType,
              ...CACHE_HEADERS,
            },
          })
        }
        const fromR2 = await fetchAttachmentFromR2(search)
        if (fromR2) {
          return new NextResponse(new Uint8Array(fromR2.body), {
            status: 200,
            headers: {
              'Content-Type': fromR2.contentType,
              ...CACHE_HEADERS,
            },
          })
        }
      }
      const redirected = await redirectToSignedOrUpstream(search, objectKey)
      if (redirected) return redirected
    }

    const cached = fromMemory(cacheKey)
    if (cached) {
      return new NextResponse(new Uint8Array(cached.body), {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          ...CACHE_HEADERS,
        },
      })
    }

    const fromR2 = await fetchAttachmentFromR2(search)
    if (fromR2) {
      remember(cacheKey, fromR2.body, fromR2.contentType)
      return new NextResponse(new Uint8Array(fromR2.body), {
        status: 200,
        headers: {
          'Content-Type': fromR2.contentType,
          ...CACHE_HEADERS,
        },
      })
    }

    for (const target of upstreamProxyUrls(search)) {
      try {
        const upstream = await fetch(target, {
          headers: { Accept: 'image/*,*/*' },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!upstream.ok) continue
        const contentType = upstream.headers.get('content-type') || ''
        if (contentType.includes('text/html')) continue
        const body = Buffer.from(await upstream.arrayBuffer())
        remember(cacheKey, body, contentType || 'application/octet-stream')
        return new NextResponse(body, {
          status: 200,
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
            ...CACHE_HEADERS,
          },
        })
      } catch {
        /* try next upstream */
      }
    }

    return NextResponse.json({ error: 'Attachment not found' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch {
    return NextResponse.json({ error: 'Attachment proxy failed' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  }
}
