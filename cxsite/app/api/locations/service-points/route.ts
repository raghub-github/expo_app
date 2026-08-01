import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 200
const CACHE_TTL_MS = 5 * 60 * 1000
const pointsCache = new Map<string, { data: unknown; expires: number }>()

export type ServicePointDto = {
  id: number
  name: string
  city: string
  latitude: number
  longitude: number
  address?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    let limit = limitParam != null ? parseInt(limitParam, 10) : DEFAULT_LIMIT
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT

    const cacheKey = `all|${limit}`
    const now = Date.now()
    const cached = pointsCache.get(cacheKey)
    if (cached && cached.expires > now) {
      return NextResponse.json(cached.data, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      })
    }

    const { data, error } = await supabase
      .from('service_points')
      .select('id, name, city, latitude, longitude, address')
      .eq('is_active', true)
      .order('city', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch service points' },
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const list: ServicePointDto[] = (data || []).map(
      (row: {
        id: number
        name: string
        city: string
        latitude: number
        longitude: number
        address?: string
      }) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        address: row.address ?? undefined,
      })
    )

    pointsCache.set(cacheKey, { data: list, expires: now + CACHE_TTL_MS })
    return NextResponse.json(list, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
