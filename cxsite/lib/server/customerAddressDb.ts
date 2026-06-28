import { customerAddresses } from '@/db/customerAddressesTable'
import type { AppDb } from '@/lib/db'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { recordLocationSelected } from '@/lib/server/customerAddressHistoryDb'

export type SavedAddressRow = {
  id: number
  location_name: string
  city: string
  state: string
  postal_code: string
  label?: string | null
  custom_label?: string | null
  address?: string
  latitude: number
  longitude: number
}

export async function listSavedLocations(db: AppDb, customerId: number): Promise<SavedAddressRow[]> {
  const rows = await db
    .select({
      id: customerAddresses.id,
      addressLine1: customerAddresses.addressLine1,
      city: customerAddresses.city,
      state: customerAddresses.state,
      postalCode: customerAddresses.postalCode,
      label: customerAddresses.label,
      customLabel: customerAddresses.customLabel,
      latitude: customerAddresses.latitude,
      longitude: customerAddresses.longitude,
    })
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt),
        /** Hide rows created by the old web “pick location” auto-save (not explicit app address-book saves). */
        sql`NOT (${customerAddresses.label} = 'OTHER' AND COALESCE(${customerAddresses.customLabel}, '') = 'Saved')`,
      )
    )
    .orderBy(desc(customerAddresses.isLastUsed), desc(customerAddresses.updatedAt))
    .limit(12)

  return rows.map((r) => ({
    id: r.id,
    location_name: r.addressLine1,
    city: r.city,
    state: r.state,
    postal_code: r.postalCode,
    label: r.label,
    custom_label: r.customLabel,
    address: [r.addressLine1, r.city, r.state, r.postalCode, 'India'].filter(Boolean).join(', '),
    latitude: r.latitude != null ? Number(r.latitude) : 0,
    longitude: r.longitude != null ? Number(r.longitude) : 0,
  }))
}

function snapshotFromAddressRow(r: {
  addressLine1: string
  city: string
  state: string
  postalCode: string
  label: string | null
  customLabel: string | null
  latitude: unknown
  longitude: unknown
}): Record<string, unknown> {
  return {
    location_name: r.addressLine1,
    city: r.city,
    state: r.state,
    postal_code: r.postalCode,
    label: r.label,
    custom_label: r.customLabel,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
  }
}

async function touchAndRecordHistory(db: AppDb, customerId: number, addressPk: number): Promise<void> {
  const [row] = await db
    .select({
      addressLine1: customerAddresses.addressLine1,
      city: customerAddresses.city,
      state: customerAddresses.state,
      postalCode: customerAddresses.postalCode,
      label: customerAddresses.label,
      customLabel: customerAddresses.customLabel,
      latitude: customerAddresses.latitude,
      longitude: customerAddresses.longitude,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.id, addressPk))
    .limit(1)
  if (!row) return
  await recordLocationSelected(db, {
    customerId,
    addressId: addressPk,
    snapshot: snapshotFromAddressRow(row),
  })
}

export async function saveOrTouchLocation(
  db: AppDb,
  input: {
    customerId: number
    locationName: string
    city: string
    latitude?: number | null
    longitude?: number | null
    /** Address label (e.g. HOME, WORK) when saving from the native app only. */
    label?: string | null
    customLabel?: string | null
  }
): Promise<void> {
  const locationName = input.locationName.trim()
  const city = input.city.trim() || 'Unknown'
  if (!locationName) return

  const rowLabel =
    typeof input.label === 'string' && input.label.trim() ? input.label.trim() : 'HOME'
  const rowCustom =
    typeof input.customLabel === 'string' && input.customLabel.trim() ? input.customLabel.trim() : null

  await db
    .update(customerAddresses)
    .set({ isLastUsed: false })
    .where(and(eq(customerAddresses.customerId, input.customerId), eq(customerAddresses.isLastUsed, true)))

  const existing = await db
    .select({ id: customerAddresses.id })
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, input.customerId),
        eq(customerAddresses.addressLine1, locationName),
        eq(customerAddresses.city, city),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(customerAddresses)
      .set({
        isLastUsed: true,
        lastUsedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerAddresses.id, existing[0].id))
    await touchAndRecordHistory(db, input.customerId, existing[0].id)
    return
  }

  const extAddressId = `ADDR-${input.customerId}-${Date.now()}`
  try {
    const [inserted] = await db
      .insert(customerAddresses)
      .values({
        customerId: input.customerId,
        addressId: extAddressId,
        label: rowLabel,
        customLabel: rowCustom,
        addressLine1: locationName,
        city,
        state: city,
        postalCode: '000000',
        latitude: input.latitude != null ? sql`${input.latitude}` : null,
        longitude: input.longitude != null ? sql`${input.longitude}` : null,
        isDefault: false,
        isActive: true,
        isLastUsed: true,
        lastUsedAt: new Date().toISOString(),
      })
      .returning({ id: customerAddresses.id })

    const newId = inserted?.id
    if (typeof newId === 'number') {
      await touchAndRecordHistory(db, input.customerId, newId)
    }
  } catch (error) {
    const code = (error as { cause?: { code?: string } } | null)?.cause?.code
    if (code !== '23505') throw error

    // Defensive fallback for envs with stricter unique rules.
    const [fallback] = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.customerId, input.customerId),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .orderBy(desc(customerAddresses.updatedAt))
      .limit(1)

    if (!fallback) throw error

    await db
      .update(customerAddresses)
      .set({
        label: rowLabel,
        customLabel: rowCustom,
        addressLine1: locationName,
        city,
        state: city,
        postalCode: '000000',
        latitude: input.latitude != null ? sql`${input.latitude}` : null,
        longitude: input.longitude != null ? sql`${input.longitude}` : null,
        isLastUsed: true,
        lastUsedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerAddresses.id, fallback.id))

    await touchAndRecordHistory(db, input.customerId, fallback.id)
  }
}
