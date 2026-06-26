import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 20
const MAX_QUERY_LENGTH = 200

/** Worldwide geocoding via Nominatim (OpenStreetMap) - no API key required */
async function searchNominatim(q: string, limit: number): Promise<Array<{ id: number; location_name: string; city: string; latitude: number; longitude: number }>> {
  const params = new URLSearchParams({
    q: q.slice(0, 150),
    format: 'json',
    addressdetails: '1',
    limit: String(Math.min(limit, 40)),
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'GatiMitraLocationSearch/1.0 (contact@gatimitra.com)',
      },
      next: { revalidate: 300 },
    }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((item: { place_id: number; lat: string; lon: string; display_name: string; address?: Record<string, string> }) => {
    const addr = item.address || {}
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.state_district ||
      addr.state ||
      addr.country ||
      ''
    return {
      id: -Math.abs(item.place_id),
      location_name: item.display_name,
      city: typeof city === 'string' ? city : '',
      latitude: parseFloat(item.lat) || 0,
      longitude: parseFloat(item.lon) || 0,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH) ?? ''
    const limitParam = searchParams.get('limit')
    let limit = limitParam != null ? parseInt(limitParam, 10) : DEFAULT_LIMIT
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT

    if (!q) {
      return NextResponse.json([], {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const safeQ = q.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim() || q.slice(0, 50)
    const pattern = `%${safeQ}%`
    const quoted = `"${pattern.replace(/"/g, '""')}"`

    const [supabaseResult, nominatimResult] = await Promise.all([
      supabase
        .from('service_points')
        .select('id, name, city, latitude, longitude')
        .eq('is_active', true)
        .or(`name.ilike.${quoted},city.ilike.${quoted}`)
        .order('name')
        .limit(limit),
      searchNominatim(q, limit),
    ])

    const { data: supabaseData, error } = supabaseResult

    if (error) {
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const localList = (supabaseData || []).map(
      (row: { id: number; name: string; city: string; latitude: number; longitude: number }) => ({
        id: row.id,
        location_name: row.name,
        city: row.city,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      })
    )

    let combined = [...localList]
    const seenKeys = new Set(localList.map((r) => r.location_name.toLowerCase() + ',' + (r.city || '').toLowerCase()))
    for (const n of nominatimResult) {
      if (combined.length >= limit) break
      const key = n.location_name.toLowerCase() + ',' + (n.city || '').toLowerCase()
      if (!seenKeys.has(key)) {
        combined.push(n)
        seenKeys.add(key)
      }
    }

    if (combined.length === 0 && q.includes(',')) {
      const parts = q.split(',').map((p) => p.trim()).filter(Boolean)
      const fallbackQueries = [
        parts.slice(-2).join(', '),
        parts[parts.length - 1] ?? '',
      ].filter((fq) => fq && fq.length >= 2)
      for (const fq of fallbackQueries) {
        const fqSafe = fq.replace(/[%_\\]/g, ' ').trim()
        const fqPattern = `%${fqSafe}%`
        const [nomFallback, byName, byCity] = await Promise.all([
          searchNominatim(fq, limit),
          supabase
            .from('service_points')
            .select('id, name, city, latitude, longitude')
            .eq('is_active', true)
            .ilike('name', fqPattern)
            .order('name')
            .limit(limit),
          supabase
            .from('service_points')
            .select('id, name, city, latitude, longitude')
            .eq('is_active', true)
            .ilike('city', fqPattern)
            .order('name')
            .limit(limit),
        ])
        const supFallbackData = [...(byName.data || []), ...(byCity.data || [])]
        const seenIds = new Set<number>()
        const deduped = supFallbackData.filter((row: { id: number }) => {
          if (seenIds.has(row.id)) return false
          seenIds.add(row.id)
          return true
        })
        const localFallback = deduped.map(
          (row: { id: number; name: string; city: string; latitude: number; longitude: number }) => ({
            id: row.id,
            location_name: row.name,
            city: row.city,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
          })
        )
        for (const r of localFallback) {
          const key = r.location_name.toLowerCase() + ',' + (r.city || '').toLowerCase()
          if (!seenKeys.has(key)) {
            combined.push(r)
            seenKeys.add(key)
          }
        }
        for (const n of nomFallback) {
          if (combined.length >= limit) break
          const key = n.location_name.toLowerCase() + ',' + (n.city || '').toLowerCase()
          if (!seenKeys.has(key)) {
            combined.push(n)
            seenKeys.add(key)
          }
        }
        if (combined.length > 0) break
      }
    }

    return NextResponse.json(combined.slice(0, limit), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
