import { NextRequest, NextResponse } from 'next/server'
import {
  GEO_SERVICES_OPEN_FALLBACK,
  resolveGeoServiceAvailabilityFromDb,
  type GeoServiceAvailabilityPayload,
} from '@/lib/server/resolveGeoServiceAvailability'
import { readUpstreamJson } from '@/lib/server/safeUpstreamJson'
import { getGatimitraBackendUrl } from '@/lib/server/gatimitraBackendUrl'

export const dynamic = 'force-dynamic'

const UPSTREAM_TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 12_000 : 4_000

/** Proxy — same as customer app GET /v1/geo/services (DB first, then backend). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pincode = searchParams.get('pincode')?.trim() || ''
  const state = searchParams.get('state')?.trim() || ''
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

  const hasPincode = pincode.length > 0
  const hasState = state.length > 0
  const lat = latParam != null && latParam !== '' ? Number(latParam) : null
  const lng = lngParam != null && lngParam !== '' ? Number(lngParam) : null
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)

  if (!hasPincode && !hasState && !hasCoords) {
    return NextResponse.json(
      { error: 'missing_location', message: 'Provide pincode, state, or lat+lng' },
      { status: 400 }
    )
  }

  const resolveArgs = {
    pincode: hasPincode ? pincode : null,
    state: hasState ? state : null,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
  }

  try {
    const fromDb = await Promise.race([
      resolveGeoServiceAvailabilityFromDb(resolveArgs),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ])
    if (fromDb) {
      return NextResponse.json(fromDb, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      })
    }
  } catch (err) {
    console.error('[GET /api/geo/services] DB resolve failed:', err)
  }

  const qs = new URLSearchParams()
  if (hasPincode) qs.set('pincode', pincode)
  if (hasState) qs.set('state', state)
  if (hasCoords) {
    qs.set('lat', String(lat))
    qs.set('lng', String(lng))
  }

  const backendUrl = getGatimitraBackendUrl()
  try {
    const upstream = await fetch(`${backendUrl}/v1/geo/services?${qs.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    const data = await readUpstreamJson<GeoServiceAvailabilityPayload>(upstream)
    if (data?.ok && upstream.ok) {
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      })
    }
    if (!upstream.ok) {
      console.warn('[GET /api/geo/services] upstream status', upstream.status)
    }
  } catch (err) {
    console.warn(
      '[GET /api/geo/services] upstream failed:',
      err instanceof Error ? err.message : err
    )
  }

  return NextResponse.json(GEO_SERVICES_OPEN_FALLBACK, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
