import { NextRequest, NextResponse } from 'next/server'

const PARTNER_ORIGIN =
  process.env.NEXT_PUBLIC_PARTNER_URL?.replace(/\/$/, '') || 'https://partner.gatimitra.com'

/**
 * Forwards attachment requests to partner API (same path as DB-stored URLs).
 * Fixes 404 when the UI requests /api/attachments/proxy on localhost.
 */
export async function GET(request: NextRequest) {
  const { search } = new URL(request.url)
  const target = `${PARTNER_ORIGIN}/api/attachments/proxy${search}`

  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'image/*,*/*' },
      next: { revalidate: 3600 },
    })

    const body = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Attachment proxy failed' }, { status: 502 })
  }
}
