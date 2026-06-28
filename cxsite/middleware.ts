import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Dev-only: allow OTP/customer auth API from another origin (e.g. localhost page → LAN IP API). */
const DEV_AUTH_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.next()
  }

  if (!request.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: DEV_AUTH_CORS })
  }

  const res = NextResponse.next()
  Object.entries(DEV_AUTH_CORS).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: ['/api/auth/:path*'],
}
