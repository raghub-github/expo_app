import { NextRequest, NextResponse } from 'next/server'

import { parseMediaRef } from '@/lib/mediaRef'

const PARTNER_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_URL?.replace(/\/$/, '') || 'https://partner.gatimitra.com'

function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!host) return false
  if (!origin) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** POST-only opaque media fetch — storage keys never appear in img src or GET query strings. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { ref?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = parseMediaRef(body.ref)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid ref' }, { status: 400 })
  }

  try {
    if (parsed.kind === 'path') {
      if (!parsed.path.startsWith('/img/') && !parsed.path.startsWith('/public/')) {
        return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
      }
      const assetUrl = new URL(parsed.path.replace(/^\/public/, ''), req.nextUrl.origin)
      const res = await fetch(assetUrl.toString(), { cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const bytes = await res.arrayBuffer()
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (parsed.kind === 'url') {
      const res = await fetch(parsed.url, { cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const bytes = await res.arrayBuffer()
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const target = `${PARTNER_ORIGIN}/api/attachments/proxy?key=${encodeURIComponent(parsed.key)}`
    const upstream = await fetch(target, {
      headers: { Accept: 'image/*,*/*' },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream failed' }, { status: upstream.status })
    }

    const bytes = await upstream.arrayBuffer()
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Media fetch failed' }, { status: 502 })
  }
}
