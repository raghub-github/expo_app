import { NextRequest, NextResponse } from 'next/server'
import { getDb, isCustomersDbConfigured } from '@/lib/db'
import {
  deleteAddressHistorySince,
  listRecentAddressHistory,
} from '@/lib/server/customerAddressHistoryDb'
import type { SavedAddressRow } from '@/lib/server/customerAddressDb'
import { RECENT_LOCATIONS_UI_MAX } from '@/lib/recentLocationsLimit'

export const runtime = 'nodejs'

function snapshotToLocationItem(addressId: number, snap: Record<string, unknown>): SavedAddressRow {
  const location_name = String(snap.location_name ?? '')
  const city = String(snap.city ?? '')
  const state = String(snap.state ?? '')
  const postal_code = String(snap.postal_code ?? '')
  const address = [location_name, city, state, postal_code, 'India'].filter((v) => v.length > 0).join(', ')
  return {
    id: addressId,
    location_name,
    city,
    state,
    postal_code,
    label: snap.label != null ? String(snap.label) : null,
    custom_label: snap.custom_label != null ? String(snap.custom_label) : null,
    address,
    latitude: typeof snap.latitude === 'number' ? snap.latitude : snap.latitude != null ? Number(snap.latitude) : 0,
    longitude: typeof snap.longitude === 'number' ? snap.longitude : snap.longitude != null ? Number(snap.longitude) : 0,
  }
}

function hasUsableLocationName(locationName: string): boolean {
  const line = locationName.trim()
  if (!line) return false
  if (!/[0-9A-Za-z\u0900-\u0DFF]/.test(line)) return false
  return true
}

/** GET /api/locations/address-history?customerId= — recently used addresses (from customer_address_history). */
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

  try {
    // Fetch extra distinct rows so after filtering unusable names we can still fill up to the UI cap.
    const rows = await listRecentAddressHistory(db, customerId, 12)
    const mapped = rows
      .map((r) => snapshotToLocationItem(r.address_id, r.address_snapshot))
      .filter((row) => hasUsableLocationName(row.location_name))
      .slice(0, RECENT_LOCATIONS_UI_MAX)
    return NextResponse.json(mapped)
  } catch (e) {
    console.error('[GET /api/locations/address-history]', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/locations/address-history?customerId=&since=ISO8601
 * Removes history rows created at or after `since` (e.g. current sheet session). Optional.
 */
export async function DELETE(req: NextRequest) {
  if (!isCustomersDbConfigured()) {
    return NextResponse.json({ ok: false, message: 'Customers DB not configured' }, { status: 501 })
  }
  const db = getDb()
  if (!db) {
    return NextResponse.json({ ok: false, message: 'Customers DB not configured' }, { status: 501 })
  }

  const rawCustomerId = req.nextUrl.searchParams.get('customerId')
  const since = req.nextUrl.searchParams.get('since')
  const customerId = rawCustomerId ? Number(rawCustomerId) : NaN
  if (!Number.isFinite(customerId) || !since || !since.trim()) {
    return NextResponse.json({ error: 'customerId and since (ISO8601) required' }, { status: 400 })
  }

  try {
    await deleteAddressHistorySince(db, customerId, since.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/locations/address-history]', e)
    return NextResponse.json({ ok: false, error: 'delete failed' }, { status: 500 })
  }
}
