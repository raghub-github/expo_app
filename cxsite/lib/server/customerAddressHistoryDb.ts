import { customerAddressHistory } from '@/db/customerAddressHistoryTable'
import type { AppDb } from '@/lib/db'
import { RECENT_LOCATIONS_UI_MAX } from '@/lib/recentLocationsLimit'
import { and, desc, eq, gte } from 'drizzle-orm'

export type AddressHistoryRow = {
  id: number
  address_id: number
  customer_id: number
  address_snapshot: Record<string, unknown>
  change_type: string
  created_at: string
}

export async function recordLocationSelected(
  db: AppDb,
  opts: {
    customerId: number
    addressId: number
    snapshot: Record<string, unknown>
  }
): Promise<void> {
  await db.insert(customerAddressHistory).values({
    customerId: opts.customerId,
    addressId: opts.addressId,
    addressSnapshot: opts.snapshot,
    changeType: 'LOCATION_SELECTED',
    changedFields: null,
  })
}

/** Most recent use per address, ordered by last use (newest first). */
export async function listRecentAddressHistory(
  db: AppDb,
  customerId: number,
  limit = RECENT_LOCATIONS_UI_MAX
): Promise<AddressHistoryRow[]> {
  const rows = await db
    .select({
      id: customerAddressHistory.id,
      addressId: customerAddressHistory.addressId,
      customerId: customerAddressHistory.customerId,
      addressSnapshot: customerAddressHistory.addressSnapshot,
      changeType: customerAddressHistory.changeType,
      createdAt: customerAddressHistory.createdAt,
    })
    .from(customerAddressHistory)
    .where(eq(customerAddressHistory.customerId, customerId))
    .orderBy(desc(customerAddressHistory.createdAt))
    .limit(80)

  const seen = new Set<number>()
  const out: AddressHistoryRow[] = []
  for (const r of rows) {
    if (seen.has(r.addressId)) continue
    seen.add(r.addressId)
    out.push({
      id: r.id,
      address_id: r.addressId,
      customer_id: r.customerId,
      address_snapshot: (r.addressSnapshot as Record<string, unknown>) ?? {},
      change_type: r.changeType,
      created_at: r.createdAt,
    })
    if (out.length >= limit) break
  }
  return out
}

/** Clear history rows created during the current sheet session (since sheet opened). */
export async function deleteAddressHistorySince(db: AppDb, customerId: number, sinceIso: string): Promise<void> {
  await db
    .delete(customerAddressHistory)
    .where(
      and(eq(customerAddressHistory.customerId, customerId), gte(customerAddressHistory.createdAt, sinceIso))
    )
}
