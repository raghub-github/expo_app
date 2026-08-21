/**
 * Customer addresses and active location.
 * - customer_addresses: matches public.customer_addresses (address_id, address_line1, city, state, postal_code, etc.)
 * - customer_active_location: session-level; lock on order, unlock on delivery
 */

import { randomUUID } from "crypto";
import { getDb } from "../../db/client.js";
import { customerAddresses, customerActiveLocation } from "../../db/schema.js";
import { eq, and, isNull, ne, sql } from "drizzle-orm";
import { forwardGeocodeAddress, reverseGeocodeCoords } from "../../services/mapbox/geocoding.js";
import { attachmentsProxyUrlFromKeyForApi } from "../../utils/attachments-proxy-url.js";
import { getEnv } from "../../config/env.js";
import { haversineMeters } from "../distance/distance.service.js";

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
  lastUsedAt: Date | null;
  /** True when this row is the bound active delivery address. */
  isSelected: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ActiveLocationRow = {
  customerId: number;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  addressId: number | null;
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

function rowToAddressRow(
  r: typeof customerAddresses.$inferSelect,
  selectedAddressId: number | null = null
): AddressRow {
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
    lastUsedAt: r.lastUsedAt ?? null,
    isSelected: selectedAddressId != null && r.id === selectedAddressId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Coerce last_used_at / created_at whether the driver returns Date or ISO string. */
function lastUsedMs(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export async function listAddresses(customerId: number): Promise<AddressRow[]> {
  const db = getDb();
  const active = await getActiveLocation(customerId);
  const selectedAddressId = active?.addressId ?? null;

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt)
      )
    );

  // MRU: active selected first, then last_used_at desc (most recently selected/used),
  // preserving relative order among older picks. Frontend must not re-sort.
  const mapped = rows.map((r) => rowToAddressRow(r, selectedAddressId));
  mapped.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    const ta = lastUsedMs(a.lastUsedAt);
    const tb = lastUsedMs(b.lastUsedAt);
    if (ta !== tb) return tb - ta;
    if ((a.isLastUsed ? 1 : 0) !== (b.isLastUsed ? 1 : 0)) {
      return (b.isLastUsed ? 1 : 0) - (a.isLastUsed ? 1 : 0);
    }
    // Stable tie-breakers only — isDefault must NOT drive MRU (default ≠ last used).
    const ca = lastUsedMs(a.createdAt);
    const cb = lastUsedMs(b.createdAt);
    if (ca !== cb) return cb - ca;
    return b.id - a.id;
  });
  return mapped;
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
      // Demote only OTHER defaults; the matched existing row is about to be set default.
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(
          and(
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.isDefault, true),
            ne(customerAddresses.id, existingRow.id)
          )
        );
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
    await db.update(customerAddresses).set({ isDefault: false }).where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)));
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
    // Demote only OTHER current defaults — never the target (which this call is about
    // to keep/make default), so a target that is already default isn't churned.
    await db
      .update(customerAddresses)
      .set({ isDefault: false })
      .where(
        and(
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isDefault, true),
          ne(customerAddresses.id, addressId)
        )
      );
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
  if (!row) return null;
  const updated = rowToAddressRow(row);

  // Keep browsing/checkout pin in sync when the bound Saved Address is edited.
  const active = await getActiveLocation(customerId);
  if (active?.addressId === addressId) {
    const lat = updated.latitude;
    const lng = updated.longitude;
    await db
      .update(customerActiveLocation)
      .set({
        latitude: lat,
        longitude: lng,
        address: updated.fullAddress,
        updatedAt: new Date(),
      })
      .where(eq(customerActiveLocation.customerId, customerId));
    console.info("[active-location] synced_after_address_edit", {
      customerId,
      addressId,
      latitude: lat,
      longitude: lng,
    });
  }

  return updated;
}

export async function deleteAddress(customerId: number, addressId: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(customerAddresses)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .returning({ id: customerAddresses.id });
  if (result.length === 0) return false;

  const active = await getActiveLocation(customerId);
  if (active?.addressId !== addressId) return true;

  // Soft-delete does not fire FK ON DELETE SET NULL — pick next valid Saved Address (MRU),
  // otherwise clear the binding so the client falls back to Current Location / reconcile.
  const remaining = (await listAddresses(customerId)).filter((a) => a.id !== addressId);
  const next = remaining[0] ?? null;
  if (next) {
    const lat = parseFloat(next.latitude) || 0;
    const lng = parseFloat(next.longitude) || 0;
    await db
      .insert(customerActiveLocation)
      .values({
        customerId,
        latitude: String(lat),
        longitude: String(lng),
        address: next.fullAddress,
        addressId: next.id,
        lockedForOrder: false,
        orderId: null,
      })
      .onConflictDoUpdate({
        target: customerActiveLocation.customerId,
        set: {
          latitude: String(lat),
          longitude: String(lng),
          address: next.fullAddress,
          addressId: next.id,
          updatedAt: new Date(),
        },
      });
    await setAddressLastUsed(customerId, next.id).catch(() => {});
    console.info("[active-location] rebound_after_delete", {
      customerId,
      deletedAddressId: addressId,
      nextAddressId: next.id,
    });
  } else {
    await db
      .update(customerActiveLocation)
      .set({ addressId: null, updatedAt: new Date() })
      .where(eq(customerActiveLocation.customerId, customerId));
    console.info("[active-location] cleared_binding_after_delete_no_fallback", {
      customerId,
      deletedAddressId: addressId,
    });
  }
  return true;
}

export async function setAddressDefault(customerId: number, addressId: number): Promise<boolean> {
  const db = getDb();
  // Demote only OTHER currently-default rows (never the target) and promote the
  // target only if it isn't already default — so re-defaulting the same address is
  // a 0-write no-op (no history-trigger churn).
  await db
    .update(customerAddresses)
    .set({ isDefault: false })
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isDefault, true),
        ne(customerAddresses.id, addressId)
      )
    );
  const promoted = await db
    .update(customerAddresses)
    .set({ isDefault: true })
    .where(
      and(
        eq(customerAddresses.id, addressId),
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isDefault, false)
      )
    )
    .returning({ id: customerAddresses.id });
  if (promoted.length > 0) return true;
  // Already the default (idempotent success) → confirm it exists for this customer.
  const [existing] = await db
    .select({ id: customerAddresses.id })
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .limit(1);
  return Boolean(existing);
}

/**
 * Mark address as most-recently selected/used (MRU).
 * Preserves other rows' last_used_at so relative MRU order stays stable.
 * Call on: user select, order place, and backend auto-restore (kept_nearby).
 *
 * IDEMPOTENT / write-minimal: this is invoked on every location reconcile
 * (app open / foreground / pre-checkout), so it must NOT write when nothing
 * changes. The previous version issued an unconditional `SET is_last_used=false`
 * across ALL of the customer's active rows plus a set on the target — N+1 writes
 * per call, every one logged by the customer_addresses history trigger. For a
 * customer with 6 saved addresses that was ~7 no-op history rows on every app
 * open (the root cause of customer_address_history bloat). We now touch only rows
 * that actually change: clear the flag solely on rows that currently hold it
 * (excluding the target), and promote the target only when it isn't already MRU.
 * Re-affirming the already-active address therefore writes ZERO rows.
 */
export async function setAddressLastUsed(customerId: number, addressId: number): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Demote only the row(s) that currently hold the MRU flag and aren't the target.
  const cleared = await db
    .update(customerAddresses)
    .set({ isLastUsed: false })
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt),
        eq(customerAddresses.isLastUsed, true),
        ne(customerAddresses.id, addressId)
      )
    )
    .returning({ id: customerAddresses.id });

  // Promote the target only if it isn't already flagged MRU. On a repeated reconcile
  // of the same active address this matches 0 rows → the whole call is 0 writes.
  const promoted = await db
    .update(customerAddresses)
    .set({ isLastUsed: true, lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(customerAddresses.id, addressId),
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt),
        eq(customerAddresses.isLastUsed, false)
      )
    )
    .returning({ id: customerAddresses.id });

  // Diagnostic only (read-only): if we neither promoted nor demoted anything, the
  // target is either already the MRU (normal, no-op) or not a valid active address.
  if (promoted.length === 0 && cleared.length === 0) {
    const [target] = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, addressId),
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .limit(1);
    if (!target) {
      console.warn("[active-location] setAddressLastUsed: address not found", {
        customerId,
        addressId,
      });
    }
  }
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
  data: {
    latitude: number;
    longitude: number;
    address?: string | null;
    /** When set, binds checkout to this saved address. Pass null to clear (e.g. live GPS). */
    addressId?: number | null;
    /** Device timestamp of the GPS fix (for §30 stale-fix guard on coord syncs). */
    capturedAt?: Date | null;
  }
): Promise<boolean> {
  const db = getDb();
  const existing = await getActiveLocation(customerId);
  if (existing?.lockedForOrder) return false;

  let addressId: number | null | undefined = data.addressId;
  if (addressId != null) {
    const owned = await db
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, addressId),
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .limit(1);
    if (owned.length === 0) {
      throw new Error("Address not found");
    }
  }

  // Omit addressId from the update when the client did not send it (legacy callers /
  // GPS coord sync). Only an explicit null clears the bound saved address.
  const patchAddressId = addressId !== undefined;
  const addressIdBefore = existing?.addressId ?? null;

  console.info("[active-location] setActiveLocation", {
    customerId,
    path: "PUT /v1/me/active-location",
    gpsLatitude: data.latitude,
    gpsLongitude: data.longitude,
    addressIdBefore,
    addressIdInRequest: addressId === undefined ? "(omit — preserve)" : addressId,
    willPatchAddressId: patchAddressId,
    addressIdAfter:
      patchAddressId ? (addressId ?? null) : addressIdBefore,
  });

  const capturedAt = data.capturedAt ?? null;
  // Apply the §30 stale-fix guard only to pure GPS coord syncs. A deliberate bind of
  // a saved address (patchAddressId && addressId != null) is a user action and must
  // always win regardless of fix age.
  const isDeliberateBind = patchAddressId && addressId != null;
  await db
    .insert(customerActiveLocation)
    .values({
      customerId,
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      address: data.address ?? null,
      // On first insert use provided id or null; on conflict we preserve when omitted.
      addressId: addressId !== undefined ? addressId : addressIdBefore,
      lockedForOrder: false,
      orderId: null,
      gpsCapturedAt: capturedAt,
    })
    .onConflictDoUpdate({
      target: customerActiveLocation.customerId,
      set: {
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        address: data.address ?? null,
        ...(patchAddressId ? { addressId: addressId ?? null } : {}),
        updatedAt: new Date(),
        gpsCapturedAt: capturedAt,
      },
      setWhere:
        capturedAt == null || isDeliberateBind
          ? undefined
          : sql`${customerActiveLocation.gpsCapturedAt} IS NULL OR ${customerActiveLocation.gpsCapturedAt} <= ${capturedAt}`,
    });

  // Explicit bind of a Saved Address always bumps MRU — including re-select of the
  // same id. GPS-only PUTs omit addressId (no bump). Clearing to Current (null) does not bump.
  if (patchAddressId && addressId != null) {
    try {
      await setAddressLastUsed(customerId, addressId);
    } catch (err) {
      console.warn("[active-location] setAddressLastUsed failed after bind", {
        customerId,
        addressId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return true;
}

export type ReconcileActiveLocationResult = {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  addressId: number | null;
  lockedForOrder: boolean;
  /** Backend decision for the client session pin. */
  source: "selected" | "current";
  /** True when a prior saved address was cleared because GPS left the retention radius. */
  switchedToCurrent: boolean;
  /**
   * Why this decision was made:
   * - kept_nearby: GPS still within retention of bound saved address
   * - switched_far: temporary/remote saved address cleared after relaunch
   * - no_bound_address: already on / switched to current (no addressId)
   * - bound_missing: addressId pointed at a deleted row
   */
  reason: "kept_nearby" | "switched_far" | "no_bound_address" | "bound_missing";
  /** Haversine distance from live GPS to the bound saved address (meters). */
  distanceM: number | null;
  /** Configured retention radius in meters (env or default 500). */
  retentionRadiusM: number;
  savedAddress: {
    id: number;
    label: string | null;
    fullAddress: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    latitude: number;
    longitude: number;
  } | null;
};

/** Force browsing pin to live GPS and clear saved-address binding (bypasses order lock). */
async function forceActiveLocationToCurrentGps(
  customerId: number,
  gps: { latitude: number; longitude: number; address?: string | null; capturedAt?: Date | null }
): Promise<void> {
  const capturedAt = gps.capturedAt ?? null;
  console.info("[active-location] force_current_gps", {
    customerId,
    path: "forceActiveLocationToCurrentGps",
    gpsLatitude: gps.latitude,
    gpsLongitude: gps.longitude,
    capturedAt: capturedAt ? capturedAt.toISOString() : null,
    note: "clears addressId",
  });
  const db = getDb();
  await db
    .insert(customerActiveLocation)
    .values({
      customerId,
      latitude: String(gps.latitude),
      longitude: String(gps.longitude),
      address: gps.address ?? "Current location",
      addressId: null,
      lockedForOrder: false,
      orderId: null,
      gpsCapturedAt: capturedAt,
    })
    .onConflictDoUpdate({
      target: customerActiveLocation.customerId,
      set: {
        latitude: String(gps.latitude),
        longitude: String(gps.longitude),
        address: gps.address ?? "Current location",
        addressId: null,
        lockedForOrder: false,
        orderId: null,
        updatedAt: new Date(),
        gpsCapturedAt: capturedAt,
      },
      // §30: an out-of-order/stale GPS fix must not overwrite a newer one. Skip the
      // overwrite when the stored fix is strictly newer than this one. No guard when
      // the caller didn't supply a fix time (legacy) → last-write-wins as before.
      setWhere:
        capturedAt == null
          ? undefined
          : sql`${customerActiveLocation.gpsCapturedAt} IS NULL OR ${customerActiveLocation.gpsCapturedAt} <= ${capturedAt}`,
    });
}

/**
 * Single source of truth: given live GPS, decide whether to keep the bound saved
 * address or switch the session to Current Location when the user has moved away
 * (including temporary remote / "order for someone else" addresses after force-close).
 *
 * Order delivery stays on the order row; this only controls the browsing/session pin.
 */
export async function reconcileActiveLocationWithGps(
  customerId: number,
  gps: { latitude: number; longitude: number; address?: string | null; capturedAt?: Date | null }
): Promise<ReconcileActiveLocationResult> {
  const retentionRadiusM = getEnv().ACTIVE_SAVED_ADDRESS_RETENTION_RADIUS_M;
  const existing = await getActiveLocation(customerId);
  const boundId = existing?.addressId ?? null;

  const logDecision = (payload: Record<string, unknown>) => {
    console.info("[active-location] reconcile", {
      customerId,
      path: "POST /v1/me/active-location/reconcile",
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      addressIdBefore: boundId,
      retentionRadiusM,
      ...payload,
    });
  };

  const asCurrent = (
    opts: { switchedToCurrent: boolean; reason: ReconcileActiveLocationResult["reason"]; distanceM: number | null }
  ): ReconcileActiveLocationResult => ({
    latitude: gps.latitude,
    longitude: gps.longitude,
    address: gps.address ?? "Current location",
    addressId: null,
    lockedForOrder: false,
    source: "current",
    switchedToCurrent: opts.switchedToCurrent,
    reason: opts.reason,
    distanceM: opts.distanceM,
    retentionRadiusM,
    savedAddress: null,
  });

  if (boundId == null) {
    await forceActiveLocationToCurrentGps(customerId, gps);
    logDecision({
      addressIdAfter: null,
      distanceM: null,
      savedLatitude: null,
      savedLongitude: null,
      reason: "no_bound_address",
      decision: "switch_to_current",
    });
    return asCurrent({ switchedToCurrent: false, reason: "no_bound_address", distanceM: null });
  }

  const rows = await listAddresses(customerId);
  const bound = rows.find((a) => a.id === boundId);
  if (!bound) {
    await forceActiveLocationToCurrentGps(customerId, gps);
    logDecision({
      addressIdAfter: null,
      distanceM: null,
      savedLatitude: null,
      savedLongitude: null,
      reason: "bound_missing",
      decision: "switch_to_current",
    });
    return asCurrent({ switchedToCurrent: true, reason: "bound_missing", distanceM: null });
  }

  const aLat = parseFloat(bound.latitude) || 0;
  const aLng = parseFloat(bound.longitude) || 0;
  const distanceM = Math.round(
    haversineMeters(
      { lat: gps.latitude, lng: gps.longitude },
      { lat: aLat, lng: aLng }
    )
  );

  const savedAddress: ReconcileActiveLocationResult["savedAddress"] = {
    id: bound.id,
    label: bound.label,
    fullAddress: bound.fullAddress,
    city: bound.city,
    state: bound.state,
    pincode: bound.pincode,
    latitude: aLat,
    longitude: aLng,
  };

  // Near the bound saved address → keep it (same city / same locality).
  if (distanceM <= retentionRadiusM) {
    // Refresh pin coords to the saved address; clear stale order lock if GPS is local again.
    const db = getDb();
    await db
      .insert(customerActiveLocation)
      .values({
        customerId,
        latitude: String(aLat),
        longitude: String(aLng),
        address: bound.fullAddress,
        addressId: bound.id,
        lockedForOrder: false,
        orderId: null,
      })
      .onConflictDoUpdate({
        target: customerActiveLocation.customerId,
        set: {
          latitude: String(aLat),
          longitude: String(aLng),
          address: bound.fullAddress,
          addressId: bound.id,
          lockedForOrder: false,
          orderId: null,
          updatedAt: new Date(),
        },
      });
    // Auto-restore of the active Saved Address updates MRU (persists across devices).
    try {
      await setAddressLastUsed(customerId, bound.id);
    } catch (err) {
      console.warn("[active-location] setAddressLastUsed failed on kept_nearby", {
        customerId,
        addressId: bound.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    logDecision({
      addressIdAfter: bound.id,
      distanceM,
      savedLatitude: aLat,
      savedLongitude: aLng,
      reason: "kept_nearby",
      decision: "retain_saved_address",
    });
    return {
      latitude: aLat,
      longitude: aLng,
      address: bound.fullAddress,
      addressId: bound.id,
      lockedForOrder: false,
      source: "selected",
      switchedToCurrent: false,
      reason: "kept_nearby",
      distanceM,
      retentionRadiusM,
      savedAddress,
    };
  }

  // Far from bound saved address (e.g. ordered for family in another city, then relaunched at home).
  // Clear binding even if previously locked — the order already stores its delivery address.
  await forceActiveLocationToCurrentGps(customerId, gps);
  logDecision({
    addressIdAfter: null,
    distanceM,
    savedLatitude: aLat,
    savedLongitude: aLng,
    reason: "switched_far",
    decision: "switch_to_current",
  });
  return asCurrent({ switchedToCurrent: true, reason: "switched_far", distanceM });
}

/** Lock active location for order (call when order placed). Snapshot coords to order. */
export async function lockActiveLocationForOrder(
  customerId: number,
  orderId: number
): Promise<{ latitude: number; longitude: number; address: string | null } | null> {
  // NOTE: This locks the browsing pin only. Order drop/pickup coords must come from
  // orders_core snapshots written at placement (address row + store row) — never from
  // customer_active_location.latitude/longitude, which may be live GPS.
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
