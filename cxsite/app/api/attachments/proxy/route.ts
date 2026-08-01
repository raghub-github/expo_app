import { NextRequest, NextResponse } from 'next/server'
import { fetchAttachmentFromR2 } from '@/lib/server/r2AttachmentProxy'

const PARTNER_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_URL?.replace(/\/$/, '') || 'https://partner.gatimitra.com'

const BACKEND_ORIGIN = process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, '') || ''

/**
 * Serves store/menu/gallery images like the customer app attachment proxy.
 * 1. R2 direct (cxsite env credentials)
 * 2. Backend /v1/attachments/proxy (customer app default)
 * 3. Partner /api/attachments/proxy
 */
export async function GET(request: NextRequest) {
  const { search } = new URL(request.url)

  try {
    const fromR2 = await fetchAttachmentFromR2(search)
    if (fromR2) {
      return new NextResponse(new Uint8Array(fromR2.body), {
        status: 200,
        headers: {
          'Content-Type': fromR2.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    const upstreams: string[] = []
    if (BACKEND_ORIGIN) {
      upstreams.push(`${BACKEND_ORIGIN}/v1/attachments/proxy${search}`)
    }
    upstreams.push(`${PARTNER_ORIGIN}/api/attachments/proxy${search}`)

    for (const target of upstreams) {
      try {
        const upstream = await fetch(target, {
          headers: { Accept: 'image/*,*/*' },
          cache: 'no-store',
        })
        if (!upstream.ok) continue
        const contentType = upstream.headers.get('content-type') || ''
        if (contentType.includes('text/html')) continue
        const body = await upstream.arrayBuffer()
        return new NextResponse(body, {
          status: upstream.status,
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
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
