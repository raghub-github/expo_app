/**
 * Config-driven catalog fare offsets (Bike Lite vs Bike, EV Auto vs Auto).
 *
 * Amounts live in `billing_pricing_rules` (inactive config rows). Quote
 * pipeline reads `value_numeric` only — do not activate these rows or the
 * billing pipeline would apply the discount a second time.
 *
 * One cached SELECT loads every offset so quote batches stay within I/O budget.
 */

import { getSql } from "../../../db/client.js";
import { cachedRideQuoteValue } from "../../ride-state-config/rideQuoteConfigCache.js";
import {
  CATALOG_FARE_OFFSET_FALLBACK_INR,
} from "../../ride-state-config/rideCustomerFare.js";
import { RIDE_FARE_DISCOUNT_SUBTYPES } from "./rideFareComponents.js";

export type RideCatalogFareOffset = {
  catalogCode: string;
  parentCatalogCode: string;
  discountInr: number;
};

export const RIDE_CATALOG_FARE_OFFSET_DEFS = [
  {
    catalogCode: "bike-lite",
    parentCatalogCode: "bike",
    subtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE,
  },
  {
    catalogCode: "ev_auto",
    parentCatalogCode: "auto",
    subtype: RIDE_FARE_DISCOUNT_SUBTYPES.EV_AUTO,
  },
] as const;

const OFFSET_SUBTYPES = RIDE_CATALOG_FARE_OFFSET_DEFS.map((d) => d.subtype);
const CACHE_KEY = "ride-catalog-fare-offsets:v1";
const CACHE_TTL_MS = 60_000;

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function fallbackOffsets(): Record<string, RideCatalogFareOffset> {
  const out: Record<string, RideCatalogFareOffset> = {};
  for (const def of RIDE_CATALOG_FARE_OFFSET_DEFS) {
    out[def.catalogCode] = {
      catalogCode: def.catalogCode,
      parentCatalogCode: def.parentCatalogCode,
      discountInr: CATALOG_FARE_OFFSET_FALLBACK_INR,
    };
  }
  return out;
}

async function loadCatalogFareOffsetsUncached(): Promise<Record<string, RideCatalogFareOffset>> {
  const out = fallbackOffsets();
  try {
    const sql = getSql();
    const rows = await sql<Array<{ charge_subtype: string | null; value_numeric: string | number | null }>>`
      SELECT charge_subtype, value_numeric
      FROM billing_pricing_rules
      WHERE upper(trim(service_type)) = 'RIDE'
        AND type = 'DISCOUNT'
        AND charge_subtype IN ${sql(OFFSET_SUBTYPES)}
      ORDER BY charge_order_key ASC NULLS LAST, id ASC
    `;
    const bySubtype = new Map<string, number>();
    for (const row of rows) {
      const subtype = String(row.charge_subtype ?? "").trim();
      if (!subtype || bySubtype.has(subtype)) continue;
      const value = num(row.value_numeric);
      if (value > 0) bySubtype.set(subtype, Math.round(value * 100) / 100);
    }
    for (const def of RIDE_CATALOG_FARE_OFFSET_DEFS) {
      const configured = bySubtype.get(def.subtype);
      out[def.catalogCode] = {
        catalogCode: def.catalogCode,
        parentCatalogCode: def.parentCatalogCode,
        discountInr: configured ?? CATALOG_FARE_OFFSET_FALLBACK_INR,
      };
    }
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ride-catalog-fare-offsets] falling back to constants", err);
    return out;
  }
}

/** Bike Lite + EV Auto offsets (₹). Cached `CACHE_TTL_MS`. */
export async function loadCatalogFareOffsets(): Promise<Record<string, RideCatalogFareOffset>> {
  return cachedRideQuoteValue(CACHE_KEY, loadCatalogFareOffsetsUncached, CACHE_TTL_MS);
}

/** @deprecated Prefer `loadCatalogFareOffsets`. */
export async function loadBikeLiteDiscount(): Promise<number> {
  const all = await loadCatalogFareOffsets();
  return all["bike-lite"]?.discountInr ?? CATALOG_FARE_OFFSET_FALLBACK_INR;
}
