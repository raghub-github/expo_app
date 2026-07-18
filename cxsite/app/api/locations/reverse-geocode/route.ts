import { NextRequest, NextResponse } from 'next/server'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
type ReverseGeoPayload = {
  address: string
  displayName: string
  city: string
  area: string
}

const cache = new Map<string, { data: ReverseGeoPayload; expires: number }>()

function getCacheKey(lat: number, lon: number): string {
  const r = 4 // 4 decimals ~11m
  return `v3_${lat.toFixed(r)}_${lon.toFixed(r)}`
}

/** City / town for URLs and LocationItem.city (Nominatim address parts). */
function extractCity(address: Record<string, string>): string {
  const { city, town, village, state_district, county, state } = address
  return (
    city ||
    town ||
    village ||
    state_district ||
    county ||
    state ||
    ''
  ).trim()
}

/** Neighbourhood / street for LocationItem.location_name slugs. */
function extractArea(address: Record<string, string>): string {
  const {
    neighbourhood,
    suburb,
    hamlet,
    village,
    quarter,
    city_district,
    road,
    residential,
    locality,
    city_block,
    borough,
    district,
  } = address
  return (
    neighbourhood ||
    suburb ||
    locality ||
    quarter ||
    city_district ||
    city_block ||
    borough ||
    district ||
    hamlet ||
    village ||
    road ||
    residential ||
    ''
  ).trim()
}

function buildDisplayName(address: Record<string, string>): string {
  const area = extractArea(address)
  const cityName = extractCity(address)
  /** Locality first reads better in the header (area, then city/town). */
  if (cityName && area && cityName.toLowerCase() !== area.toLowerCase()) {
    return `${area}, ${cityName}`
  }
  if (cityName) return cityName
  if (area) return area
  return 'Your Location'
}

/** Prefer Nominatim’s full line, trimmed to a few segments (avoids a single wrong `town` like OSM quirks). */
function shortenNominatimDisplayName(full: string): string {
  const parts = full
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  while (parts.length && /^india$/i.test(parts[parts.length - 1])) parts.pop()
  if (parts.length > 4) return parts.slice(0, 4).join(', ')
  return parts.join(', ') || full
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latParam = searchParams.get('lat')
    const lonParam = searchParams.get('lon')

    const lat = latParam != null ? Number(latParam) : NaN
    const lon = lonParam != null ? Number(lonParam) : NaN

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json(
        { error: 'Missing or invalid lat/lon' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    // Global bounds (optional: restrict to India 6-37, 68-98)
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Lat/lon out of range' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const nocache = searchParams.get('nocache') === '1' || searchParams.get('nocache') === 'true'
    const key = getCacheKey(lat, lon)
    const cached = nocache ? null : cache.get(key)
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        },
      })
    }

    /** zoom=18 → neighbourhood / village detail; reduces wrong distant town names. */
    const url = `${NOMINATIM_URL}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GatiMitra-LocationSearch/1.0' },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Geocoding service unavailable' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const data = (await res.json()) as { address?: Record<string, string>; display_name?: string }
    const address = data?.address
    const fromNominatim =
      typeof data.display_name === 'string' && data.display_name.trim() !== ''
        ? shortenNominatimDisplayName(data.display_name.trim())
        : ''
    const city = address ? extractCity(address) : ''
    let area = address ? extractArea(address) : ''
    // If OSM address parts lack a neighbourhood, use the most-specific Nominatim segment.
    if (!area && fromNominatim) {
      const first = fromNominatim.split(',')[0]?.trim() || ''
      if (
        first &&
        (!city || first.toLowerCase() !== city.toLowerCase()) &&
        !/^india$/i.test(first)
      ) {
        area = first
      }
    }
    // Prefer locality/area first (not city-only).
    const areaFirst = address ? buildDisplayName(address) : ''
    const areaCityLabel =
      area && city && area.toLowerCase() !== city.toLowerCase()
        ? `${area}, ${city}`
        : ''
    const displayName =
      areaCityLabel ||
      fromNominatim ||
      areaFirst ||
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    const payload: ReverseGeoPayload = {
      address: displayName,
      displayName,
      city,
      area: area || (areaCityLabel.includes(',') ? areaCityLabel.split(',')[0].trim() : area),
    }

    cache.set(key, { data: payload, expires: Date.now() + CACHE_TTL_MS })
    if (cache.size > 5000) {
      const now = Date.now()
      for (const [k, v] of Array.from(cache.entries())) if (v.expires < now) cache.delete(k)
    }

    return NextResponse.json(payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
