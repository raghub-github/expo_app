/**
 * Customer addresses and active location.
 * - customer_addresses: matches public.customer_addresses (address_id, address_line1, city, state, postal_code, etc.)
 * - customer_active_location: session-level; lock on order, unlock on delivery
 */

import { randomUUID } from "crypto";
import { getDb } from "../../db/client.js";
import { customerAddresses, customerActiveLocation } from "../../db/schema.js";
import { eq, and, desc, isNull, ne, sql } from "drizzle-orm";
import { forwardGeocodeAddress, reverseGeocodeCoords } from "../../services/mapbox/geocoding.js";
import { attachmentsProxyUrlFromKeyForApi } from "../../utils/attachments-proxy-url.js";

/** Treat em-dash, dashes, and "no value" tokens as missing so they're not persisted as state/city/pincode. */

/** Only stable proxy paths are stored — never raw image bytes or data: URLs. */
export function isAllowedDoorImageStoredUrl(url: string | null | undefined): boolean {
  if (url == null) return false;
  const t = String(url).trim();
  if (!t || t.startsWith("data:") || t.startsWith("blob:")) return false;
  return (
    t.startsWith("/v1/attachments/proxy") ||
    t.startsWith("/api/attachments/proxy") ||
    /^https?:\/\//i.test(t)
  );
}

export function normalizeDoorImageStoredUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const t = String(url).trim();
  if (!t || t.startsWith("data:") || t.startsWith("blob:")) return null;
  if (t.startsWith("/api/attachments/proxy")) {
    return `/v1/attachments/proxy${t.slice("/api/attachments/proxy".length)}`;
  }
  if (t.startsWith("/v1/attachments/proxy") || /^https?:\/\//i.test(t)) return t;
  return null;
}

export function doorImageProxyUrlFromR2Key(r2Key: string): string {
  return attachmentsProxyUrlFromKeyForApi(r2Key);
}
function isPlaceholder(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = String(v).trim();
  if (!t) return true;
  if (t === "—" || t === "–" || t === "-" || t === "--" || t === "---") return true;
  const lower = t.toLowerCase();
  return lower === "n/a" || lower === "na" || lower === "null" || lower === "none" || lower === "unknown";
}

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
  deliveryDoorImageUrl: string | null;
  deliveryInstructionsList: string[];
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

function parseInstructionsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim())
    .filter((s) => s.length > 0);
}

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
    deliveryDoorImageUrl: normalizeDoorImageStoredUrl(r.deliveryDoorImageUrl),
    deliveryInstructionsList: parseInstructionsList(r.deliveryInstructionsList),
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
    latitude?: number;
    longitude?: number;
    isDefault?: boolean;
    contactName?: string | null;
    contactMobile?: string | null;
  }
): Promise<AddressRow> {
  const db = getDb();
  const { label: addressType, customLabel } = toLabelAndCustom(data.label);
  let latitude = data.latitude;
  let longitude = data.longitude;

  // Production-grade: allow saving by text address only; geocode via Mapbox if coords missing.
  if (latitude == null || longitude == null) {
    const geo = await forwardGeocodeAddress(data.fullAddress);
    if (!geo) throw new Error("Could not geocode address. Please select the location on map and try again.");
    latitude = geo.latitude;
    longitude = geo.longitude;
    // Fill in missing locality fields when user didn't provide them.
    if (isPlaceholder(data.city) && geo.city) data.city = geo.city;
    if (isPlaceholder(data.state) && geo.state) data.state = geo.state;
    if (isPlaceholder(data.pincode) && geo.pincode) data.pincode = geo.pincode;
  }

  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw new Error("Invalid address coordinates. Please select the location on map and try again.");
  }

  // If still missing after the above, reverse-geocode lat/lng to fill state/city/pincode.
  // Without this, geo-bound platform offers and per-state delivery slabs won't resolve.
  if (isPlaceholder(data.city) || isPlaceholder(data.state) || isPlaceholder(data.pincode)) {
    try {
      const rg = await reverseGeocodeCoords(Number(latitude), Number(longitude));
      if (rg) {
        if (isPlaceholder(data.city) && rg.city) data.city = rg.city;
        if (isPlaceholder(data.state) && rg.state) data.state = rg.state;
        if (isPlaceholder(data.pincode) && rg.pincode) data.pincode = rg.pincode;
      }
    } catch {
      // best-effort
    }
  }

  // Persist real values when available; em-dash placeholder is a last-resort to satisfy NOT NULL.
  const city = isPlaceholder(data.city) ? "—" : String(data.city).trim();
  const state = isPlaceholder(data.state) ? "—" : String(data.state).trim();
  const postalCode = isPlaceholder(data.pincode) ? "—" : String(data.pincode).trim();

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
        sql`ABS((${customerAddresses.latitude}::double precision) - ${Number(latitude)}) < ${LOCATION_TOLERANCE}`,
        sql`ABS((${customerAddresses.longitude}::double precision) - ${Number(longitude)}) < ${LOCATION_TOLERANCE}`
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
      latitude: latitude != null ? String(latitude) : null,
      longitude: longitude != null ? String(longitude) : null,
      contactName: data.contactName ?? null,
      contactMobile: data.contactMobile ?? null,
      deliveryDoorImageUrl: null,
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
    contactName: string | null;
    contactMobile: string | null;
    deliveryDoorImageUrl: string | null;
    deliveryInstructionsList: string[];
  }>
): Promise<AddressRow | null> {
  const db = getDb();
  if (data.isDefault) {
    await db.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customerId));
  }
  const set: Partial<typeof customerAddresses.$inferInsert> = {};
  if (data.label !== undefined) {
    const { label: addressType, customLabel } = toLabelAndCustom(data.label);
    // One active Home/Work per customer — demote the previous one when re-labeling.
    if (addressType === "HOME" || addressType === "WORK") {
      await db
        .update(customerAddresses)
        .set({ label: "OTHER", customLabel: null, updatedAt: new Date() })
        .where(
          and(
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.label, addressType),
            eq(customerAddresses.isActive, true),
            isNull(customerAddresses.deletedAt),
            ne(customerAddresses.id, addressId)
          )
        );
    }
    set.label = addressType;
    set.customLabel = customLabel;
  }
  if (data.fullAddress !== undefined) set.addressLine1 = data.fullAddress;
  if (data.landmark !== undefined) set.landmark = data.landmark;
  if (data.city !== undefined) set.city = (data.city ?? "").trim() || "—";
  if (data.state !== undefined) set.state = (data.state ?? "").trim() || "—";
  if (data.pincode !== undefined) set.postalCode = (data.pincode ?? "").trim() || "—";
  if (data.country !== undefined) set.country = data.country;
  // If fullAddress changed but coords not provided, geocode to keep coordinates valid.
  if ((data.latitude == null || data.longitude == null) && data.fullAddress != null) {
    const geo = await forwardGeocodeAddress(data.fullAddress);
    if (geo) {
      if (data.latitude == null) set.latitude = String(geo.latitude);
      if (data.longitude == null) set.longitude = String(geo.longitude);
      if (data.city == null && geo.city) set.city = geo.city;
      if (data.state == null && geo.state) set.state = geo.state;
      if (data.pincode == null && geo.pincode) set.postalCode = geo.pincode;
    }
  }
  if (data.latitude != null) set.latitude = String(data.latitude);
  if (data.longitude != null) set.longitude = String(data.longitude);
  if (data.isDefault !== undefined) set.isDefault = data.isDefault;
  if (data.contactName !== undefined) set.contactName = data.contactName;
  if (data.contactMobile !== undefined) set.contactMobile = data.contactMobile;
  if (data.deliveryDoorImageUrl !== undefined) {
    const normalized = normalizeDoorImageStoredUrl(data.deliveryDoorImageUrl);
    if (data.deliveryDoorImageUrl != null && data.deliveryDoorImageUrl !== "" && normalized == null) {
      throw new Error("Invalid door image URL. Upload the image via POST /addresses/:id/door-image.");
    }
    set.deliveryDoorImageUrl = normalized;
  }
  if (data.deliveryInstructionsList !== undefined) {
    const cleaned = [
      ...new Set(
        data.deliveryInstructionsList.map((s) => String(s ?? "").trim()).filter((s) => s.length > 0)
      ),
    ];
    set.deliveryInstructionsList = cleaned;
    set.deliveryInstructions = cleaned.length > 0 ? cleaned.join(" | ") : null;
  }
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
