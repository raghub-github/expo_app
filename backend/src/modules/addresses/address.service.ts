/**
 * Customer addresses and active location.
 * - customer_addresses: matches public.customer_addresses (address_id, address_line1, city, state, postal_code, etc.)
 * - customer_active_location: session-level; lock on order, unlock on delivery
 */

import { randomUUID } from "crypto";
import { getDb } from "../../db/client.js";
import { customerAddresses, customerActiveLocation } from "../../db/schema.js";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

/** App-facing shape (id, fullAddress, pincode, etc.) for list/detail. */
export type AddressRow = {
  id: number;
  customerId: number;
  label: string | null;
  fullAddress: string;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  latitude: string;
  longitude: string;
  contactName: string | null;
  contactMobile: string | null;
  isDefault: boolean | null;
  isLastUsed: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ActiveLocationRow = {
  customerId: number;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  lockedForOrder: boolean | null;
  orderId: number | null;
  updatedAt: Date | null;
};

function rowToAddressRow(r: typeof customerAddresses.$inferSelect): AddressRow {
  const fullAddress = [r.addressLine1, r.addressLine2].filter(Boolean).join(", ") || r.addressLine1;
  const label = r.customLabel ?? r.label ?? null;
  return {
    id: r.id,
    customerId: r.customerId,
    label,
    fullAddress,
    landmark: r.landmark,
    city: r.city,
    state: r.state,
    pincode: r.postalCode,
    country: r.country,
    latitude: r.latitude ?? "",
    longitude: r.longitude ?? "",
    contactName: r.contactName ?? null,
    contactMobile: r.contactMobile ?? null,
    isDefault: r.isDefault ?? false,
    isLastUsed: r.isLastUsed ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function listAddresses(customerId: number): Promise<AddressRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt)
      )
    )
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.isLastUsed), customerAddresses.createdAt);
  return rows.map(rowToAddressRow);
}

/** Map API label to address_type enum. "Current location" / custom -> OTHER + custom_label. */
function toLabelAndCustom(label?: string | null): { label: "HOME" | "WORK" | "HOTEL" | "OTHER"; customLabel: string | null } {
  const normalized = (label ?? "").trim().toUpperCase();
  if (["HOME", "WORK", "HOTEL", "OTHER"].includes(normalized))
    return { label: normalized as "HOME" | "WORK" | "HOTEL" | "OTHER", customLabel: null };
  return { label: "OTHER", customLabel: label && label.trim() ? label.trim() : null };
}

const LOCATION_TOLERANCE = 0.0001; // ~11m; same coordinates = reuse existing address

export async function addAddress(
  customerId: number,
  data: {
    label?: string | null;
    fullAddress: string;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    country?: string | null;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
    contactName?: string | null;
    contactMobile?: string | null;
  }
): Promise<AddressRow> {
  const db = getDb();
  const { label: addressType, customLabel } = toLabelAndCustom(data.label);
  const city = (data.city ?? "").trim() || "—";
  const state = (data.state ?? "").trim() || "—";
  const postalCode = (data.pincode ?? "").trim() || "—";

  // Home/Work uniqueness: only one active Home and one active Work per customer
  if (addressType === "HOME" || addressType === "WORK") {
    const existingLabel = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.label, addressType),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .limit(1);
    if (existingLabel.length > 0) {
      throw new Error(
        addressType === "HOME"
          ? "You already have a Home address. Please edit or delete it first."
          : "You already have a Work address. Please edit or delete it first."
      );
    }
  }

  // Duplicate detection: same customer + same location (within tolerance) → update existing, do not insert
  const existing = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt),
        sql`ABS((${customerAddresses.latitude}::double precision) - ${data.latitude}) < ${LOCATION_TOLERANCE}`,
        sql`ABS((${customerAddresses.longitude}::double precision) - ${data.longitude}) < ${LOCATION_TOLERANCE}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const existingRow = existing[0];
    if (data.isDefault) {
      await db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
    }
    const [updated] = await db
      .update(customerAddresses)
      .set({
        addressLine1: data.fullAddress,
        addressAuto: data.fullAddress,
        customLabel: customLabel ?? existingRow.customLabel,
        label: addressType,
        city,
        state,
        postalCode,
        country: data.country ?? "IN",
        contactName: data.contactName ?? existingRow.contactName ?? null,
        contactMobile: data.contactMobile ?? existingRow.contactMobile ?? null,
        ...(data.isDefault != null && { isDefault: data.isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(customerAddresses.id, existingRow.id))
      .returning();
    return rowToAddressRow(updated);
  }

  if (data.isDefault) {
    await db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
  }
  const addressId = randomUUID();
  const [row] = await db
    .insert(customerAddresses)
    .values({
      customerId,
      addressId,
      label: addressType,
      customLabel,
      addressLine1: data.fullAddress,
      addressLine2: null,
      addressAuto: data.fullAddress,
      addressManual: null,
      landmark: data.landmark ?? null,
      city,
      state,
      postalCode,
      country: data.country ?? "IN",
      latitude: data.latitude != null ? String(data.latitude) : null,
      longitude: data.longitude != null ? String(data.longitude) : null,
      contactName: data.contactName ?? null,
      contactMobile: data.contactMobile ?? null,
      isDefault: data.isDefault ?? false,
      isLastUsed: false,
    })
    .returning();
  return rowToAddressRow(row);
}

export async function updateAddress(
  customerId: number,
  addressId: number,
  data: Partial<{
    label: string | null;
    fullAddress: string;
    landmark: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    country: string | null;
    latitude: number;
    longitude: number;
    isDefault: boolean;
  }>
): Promise<AddressRow | null> {
  const db = getDb();
  if (data.isDefault) {
    await db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
  }
  const set: Partial<typeof customerAddresses.$inferInsert> = {};
  if (data.label !== undefined) {
    const { label: addressType, customLabel } = toLabelAndCustom(data.label);
    set.label = addressType;
    set.customLabel = customLabel;
  }
  if (data.fullAddress !== undefined) set.addressLine1 = data.fullAddress;
  if (data.landmark !== undefined) set.landmark = data.landmark;
  if (data.city !== undefined) set.city = (data.city ?? "").trim() || "—";
  if (data.state !== undefined) set.state = (data.state ?? "").trim() || "—";
  if (data.pincode !== undefined) set.postalCode = (data.pincode ?? "").trim() || "—";
  if (data.country !== undefined) set.country = data.country;
  if (data.latitude != null) set.latitude = String(data.latitude);
  if (data.longitude != null) set.longitude = String(data.longitude);
  if (data.isDefault !== undefined) set.isDefault = data.isDefault;
  set.updatedAt = new Date();
  const keys = Object.keys(set).filter((k) => k !== "updatedAt");
  if (keys.length === 0) return (await listAddresses(customerId)).find((a) => a.id === addressId) ?? null;
  const [row] = await db
    .update(customerAddresses)
    .set(set)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .returning();
  return row ? rowToAddressRow(row) : null;
}

export async function deleteAddress(customerId: number, addressId: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(customerAddresses)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .returning({ id: customerAddresses.id });
  return result.length > 0;
}

export async function setAddressDefault(customerId: number, addressId: number): Promise<boolean> {
  const db = getDb();
  await db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
  const result = await db
    .update(customerAddresses)
    .set({ isDefault: true })
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .returning({ id: customerAddresses.id });
  return result.length > 0;
}

/** Set is_last_used = true for this address, false for others. Call when order is placed. */
export async function setAddressLastUsed(customerId: number, addressId: number): Promise<void> {
  const db = getDb();
  await db.update(customerAddresses).set({ isLastUsed: false }).where(eq(customerAddresses.customerId, customerId));
  await db
    .update(customerAddresses)
    .set({ isLastUsed: true })
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)));
}

// --- Active location ---

export async function getActiveLocation(customerId: number): Promise<ActiveLocationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(customerActiveLocation)
    .where(eq(customerActiveLocation.customerId, customerId))
    .limit(1);
  return (row as ActiveLocationRow) ?? null;
}

/** Set active location (fails if locked_for_order). Returns true if set. */
export async function setActiveLocation(
  customerId: number,
  data: { latitude: number; longitude: number; address?: string | null }
): Promise<boolean> {
  const db = getDb();
  const existing = await getActiveLocation(customerId);
  if (existing?.lockedForOrder) return false;
  await db
    .insert(customerActiveLocation)
    .values({
      customerId,
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      address: data.address ?? null,
      lockedForOrder: false,
      orderId: null,
    })
    .onConflictDoUpdate({
      target: customerActiveLocation.customerId,
      set: {
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        address: data.address ?? null,
        updatedAt: new Date(),
      },
    });
  return true;
}

/** Lock active location for order (call when order placed). Snapshot coords to order. */
export async function lockActiveLocationForOrder(
  customerId: number,
  orderId: number
): Promise<{ latitude: number; longitude: number; address: string | null } | null> {
  const db = getDb();
  const row = await getActiveLocation(customerId);
  if (!row || row.lockedForOrder) return null;
  const lat = row.latitude != null ? parseFloat(row.latitude) : null;
  const lng = row.longitude != null ? parseFloat(row.longitude) : null;
  if (lat == null || lng == null) return null;
  await db
    .update(customerActiveLocation)
    .set({ lockedForOrder: true, orderId, updatedAt: new Date() })
    .where(eq(customerActiveLocation.customerId, customerId));
  return { latitude: lat, longitude: lng, address: row.address };
}

/** Unlock after delivery. */
export async function unlockActiveLocation(customerId: number): Promise<void> {
  const db = getDb();
  await db
    .update(customerActiveLocation)
    .set({ lockedForOrder: false, orderId: null, updatedAt: new Date() })
    .where(eq(customerActiveLocation.customerId, customerId));
}
