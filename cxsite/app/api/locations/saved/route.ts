import { NextRequest, NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import { isPanIndiaSavedRow } from '@/lib/panIndiaLocation'
import { listSavedLocations, saveOrTouchLocation } from '@/lib/server/customerAddressDb'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isCustomersDbConfigured()) {
    return NextResponse.json([])
  }
  const db = getDb()
  if (!db) return NextResponse.json([])

  const rawCustomerId = req.nextUrl.searchParams.get('customerId')
  const customerId = rawCustomerId ? Number(rawCustomerId) : NaN
  if (!Number.isFinite(customerId)) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  }

  const rows = await listSavedLocations(db, customerId)
  const visible = rows.filter((r) => !isPanIndiaSavedRow(r.location_name, r.city))
  return NextResponse.json(visible)
}

export async function POST(req: NextRequest) {
  if (!isCustomersDbConfigured()) {
    return NextResponse.json({ ok: false, message: 'Customers DB not configured' }, { status: 501 })
  }
  const db = getDb()
  if (!db) {
    return NextResponse.json({ ok: false, message: 'Customers DB not configured' }, { status: 501 })
  }

  /** Persisting to the address book is only allowed from the native app (not the marketing website). */
  const client = (req.headers.get('x-gatimitra-client') || '').trim().toLowerCase()
  if (client !== 'app') {
    return NextResponse.json(
      {
        error: 'Address book saves are only available from the Gatimitra app. Use “Recently used” on the website.',
      },
      { status: 403 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const customerId = Number(body.customerId)
  const locationName = String(body.location_name ?? body.locationName ?? '').trim()
  const city = String(body.city ?? '').trim()
  const latitude = body.latitude != null ? Number(body.latitude) : null
  const longitude = body.longitude != null ? Number(body.longitude) : null
  const label = body.label != null ? String(body.label).trim() : ''
  const customLabel = body.custom_label != null ? String(body.custom_label).trim() : ''

  if (!Number.isFinite(customerId) || !locationName) {
    return NextResponse.json({ error: 'customerId and location_name required' }, { status: 400 })
  }

  try {
    await saveOrTouchLocation(db, {
      customerId,
      locationName,
      city,
      latitude,
      longitude,
      label: label || null,
      customLabel: customLabel || null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/locations/saved POST]', e)
    return NextResponse.json({ ok: false, error: 'save failed' }, { status: 500 })
  }
}
