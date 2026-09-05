/**
 * One-time shareable delivery address links (Zomato-style).
 */

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { customerAddresses, customers } from "../db/schema.js";
import { getEnv } from "../config/env.js";
import {
  addAddress,
  setAddressDefault,
  setActiveLocation,
} from "../modules/addresses/address.service.js";

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

export function generateAddressShareToken(): string {
  return randomBytes(8).toString("hex");
}

export function generateAddressShareShortCode(): string {
  return randomBytes(4).toString("hex");
}

export function buildAddressShareUrl(_shortCode: string, token: string): string {
  const env = getEnv();
  const explicit = env.ADDRESS_LINK_BASE_URL?.replace(/\/+$/, "");
  if (explicit) return `${explicit}/address/share/${encodeURIComponent(token)}`;

  if (env.NODE_ENV !== "production") {
    const apiBase = env.API_BASE_URL?.replace(/\/+$/, "");
    if (apiBase) return `${apiBase}/address/share/${encodeURIComponent(token)}`;
    return `http://localhost:${env.PORT}/address/share/${encodeURIComponent(token)}`;
  }

  return `https://gatimitra.com/address/share/${encodeURIComponent(token)}`;
}

/** Absolute HTTPS URL for WhatsApp / Telegram link-preview image (og:image). */
export function buildAddressShareOgImageUrl(): string {
  const base = resolveAddressLinkPublicBase();
  return `${base}/addr/og-logo.png`;
}

/** Public origin used in Open Graph tags — must be reachable by WhatsApp crawlers. */
export function resolveAddressLinkPublicBase(): string {
  const env = getEnv();
  const explicit = env.ADDRESS_LINK_BASE_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  if (env.NODE_ENV === "production") return "https://gatimitra.com";
  const apiBase = env.API_BASE_URL?.replace(/\/+$/, "");
  if (apiBase) return apiBase;
  return `http://localhost:${env.PORT}`;
}

export function isAddressSharePreviewSupported(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildAddressShareMessage(fullAddress: string, url: string): string {
  return [
    fullAddress.trim(),
    "",
    `Click to save: ${url}`,
    "",
    "This is a one-time link and is valid for the next 24 hours only.",
  ].join("\n");
}

type ShareRow = {
  token: string;
  shortCode: string;
  sharerCustomerId: number;
  sourceAddressId: number | null;
  fullAddress: string;
  label: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  contactName: string | null;
  contactMobile: string | null;
  expiresAt: Date;
  claimedAt: Date | null;
};

async function loadShareByToken(token: string): Promise<ShareRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT token, short_code, sharer_customer_id, source_address_id, full_address, label, landmark, city, state, postal_code,
           country, latitude, longitude, contact_name, contact_mobile, expires_at, claimed_at
    FROM address_share_links
    WHERE token = ${token}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    token: String(r.token),
    shortCode: String(r.short_code),
    sharerCustomerId: Number(r.sharer_customer_id),
    sourceAddressId: r.source_address_id != null ? Number(r.source_address_id) : null,
    fullAddress: String(r.full_address),
    label: r.label != null ? String(r.label) : null,
    landmark: r.landmark != null ? String(r.landmark) : null,
    city: r.city != null ? String(r.city) : null,
    state: r.state != null ? String(r.state) : null,
    postalCode: r.postal_code != null ? String(r.postal_code) : null,
    country: r.country != null ? String(r.country) : null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    contactName: r.contact_name != null ? String(r.contact_name) : null,
    contactMobile: r.contact_mobile != null ? String(r.contact_mobile) : null,
    expiresAt: new Date(String(r.expires_at)),
    claimedAt: r.claimed_at ? new Date(String(r.claimed_at)) : null,
  };
}

export async function createAddressShareLink(args: {
  customerPk: number;
  addressId: number;
}): Promise<{ token: string; shortCode: string; url: string; expiresAt: string; shareMessage: string; linkPreviewSupported: boolean }> {
  const db = getDb();
  const [addr] = await db
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.id, args.addressId),
        eq(customerAddresses.customerId, args.customerPk),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt)
      )
    )
    .limit(1);

  if (!addr) throw new Error("address_not_found");

  const token = generateAddressShareToken();
  const shortCode = generateAddressShareShortCode();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const fullAddress =
    [addr.addressLine1, addr.addressLine2].filter(Boolean).join(", ") || addr.addressLine1;
  const label = addr.customLabel ?? addr.label;

  const sql = getSql();
  await sql`
    INSERT INTO address_share_links (
      token, short_code, sharer_customer_id, source_address_id,
      full_address, label, landmark, city, state, postal_code, country,
      latitude, longitude, contact_name, contact_mobile, expires_at
    ) VALUES (
      ${token},
      ${shortCode},
      ${args.customerPk},
      ${addr.id},
      ${fullAddress},
      ${label},
      ${addr.landmark},
      ${addr.city},
      ${addr.state},
      ${addr.postalCode},
      ${addr.country ?? "IN"},
      ${String(addr.latitude)},
      ${String(addr.longitude)},
      ${addr.contactName},
      ${addr.contactMobile},
      ${expiresAt.toISOString()}
    )
  `;

  const url = buildAddressShareUrl(shortCode, token);
  return {
    token,
    shortCode,
    url,
    expiresAt: expiresAt.toISOString(),
    shareMessage: buildAddressShareMessage(fullAddress, url),
    linkPreviewSupported: isAddressSharePreviewSupported(url),
  };
}

export async function getAddressSharePreview(token: string) {
  const row = await loadShareByToken(token);
  if (!row) return { ok: false as const, error: "not_found" as const };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false as const, error: "expired" as const };
  if (row.claimedAt) return { ok: false as const, error: "already_claimed" as const };

  return {
    ok: true as const,
    address: {
      fullAddress: row.fullAddress,
      label: row.label,
      landmark: row.landmark,
      city: row.city,
      state: row.state,
      pincode: row.postalCode,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      contactName: row.contactName,
      contactMobile: row.contactMobile,
    },
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function claimAddressShareLink(args: {
  token: string;
  recipientCustomerPk: number;
}): Promise<{
  addressId: number;
  fullAddress: string;
  latitude: number;
  longitude: number;
  label: string | null;
}> {
  const row = await loadShareByToken(args.token);
  if (!row) throw new Error("not_found");
  if (row.expiresAt.getTime() <= Date.now()) throw new Error("expired");
  if (row.claimedAt) throw new Error("already_claimed");

  const resultPayload = {
    fullAddress: row.fullAddress,
    latitude: row.latitude,
    longitude: row.longitude,
    label: row.label,
  };

  // Sender opening their own link must not mutate or re-save their address.
  if (row.sharerCustomerId === args.recipientCustomerPk) {
    return {
      addressId: row.sourceAddressId ?? 0,
      ...resultPayload,
    };
  }

  const sql = getSql();
  const claimed = (await sql`
    UPDATE address_share_links
    SET claimed_at = NOW(), claimed_by_customer_id = ${args.recipientCustomerPk}
    WHERE token = ${args.token}
      AND claimed_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `) as Array<{ id: number }>;
  if (!claimed[0]) throw new Error("already_claimed");

  const saved = await addAddress(args.recipientCustomerPk, {
    label: row.label ?? "Shared",
    fullAddress: row.fullAddress,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    pincode: row.postalCode,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    contactName: row.contactName,
    contactMobile: row.contactMobile,
    isDefault: true,
  });

  await setAddressDefault(args.recipientCustomerPk, saved.id);
  await setActiveLocation(args.recipientCustomerPk, {
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.fullAddress,
  });

  return {
    addressId: saved.id,
    ...resultPayload,
  };
}

export async function getAddressShareForLandingPage(shortCode: string, token: string) {
  const sql = getSql();
  const rows = (await sql`
    SELECT full_address, expires_at, claimed_at
    FROM address_share_links
    WHERE short_code = ${shortCode} AND token = ${token}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    fullAddress: String(r.full_address),
    expiresAt: new Date(String(r.expires_at)),
    claimedAt: r.claimed_at ? new Date(String(r.claimed_at)) : null,
    token,
    shortCode,
  };
}

export async function getAddressShareForLandingByToken(token: string) {
  const row = await loadShareByToken(token);
  if (!row) return null;
  return {
    fullAddress: row.fullAddress,
    expiresAt: row.expiresAt,
    claimedAt: row.claimedAt,
    token: row.token,
    shortCode: row.shortCode,
  };
}

import { resolveCustomerPkFromSubCached } from "./customer-auth.js";

export async function resolveCustomerPkFromSub(sub: string): Promise<number | null> {
  return resolveCustomerPkFromSubCached(sub);
}
