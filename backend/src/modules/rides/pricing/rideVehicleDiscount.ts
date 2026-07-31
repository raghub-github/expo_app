/**
 * Config-driven ride vehicle discounts.
 *
 * Phase 1 hardcoded `BIKE_LITE_DISCOUNT_INR = 12` in `rideCustomerFare.ts`.
 * Phase 2 moves that value into `billing_pricing_rules` (seeded by migration
 * 0464) so the Super Admin billing UI can tweak it without a deploy.
 *
 * The lookup is cached for a short TTL via the same in-process cache used by
 * the rest of the ride quote pipeline (`rideQuoteConfigCache`) so quote
 * batches don't flood the DB.
 *
 * If the config row is absent OR inactive OR the DB is unreachable, we fall
 * back to the legacy constant so ride quotes never fail because a config row
 * went missing.
 */

import { getSql } from "../../../db/client.js";
import { cachedRideQuoteValue } from "../../ride-state-config/rideQuoteConfigCache.js";
import {
  BIKE_LITE_DISCOUNT_INR,
} from "../../ride-state-config/rideCustomerFare.js";
import { RIDE_FARE_DISCOUNT_SUBTYPES } from "./rideFareComponents.js";

const CACHE_KEY = "ride-vehicle-discount:bike-lite:v1";
const CACHE_TTL_MS = 60_000;

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

async function loadBikeLiteDiscountUncached(): Promise<number> {
  try {
    const sql = getSql();
    // NB: intentionally NOT filtered by is_active — the row is a config-only
    // seed and must stay inactive (see 0464 migration notes). We just read
    // value_numeric so admins can retune the amount without risking the
    // pipeline applying the same discount a second time.
    const rows = await sql<Array<{ value_numeric: string | number | null }>>`
      SELECT value_numeric
      FROM billing_pricing_rules
      WHERE service_type = 'RIDE'
        AND type = 'DISCOUNT'
        AND charge_subtype = ${RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE}
      ORDER BY charge_order_key ASC NULLS LAST, id ASC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return BIKE_LITE_DISCOUNT_INR;
    const value = num(row.value_numeric);
    return value > 0 ? Math.round(value * 100) / 100 : BIKE_LITE_DISCOUNT_INR;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ride-vehicle-discount] falling back to constant", err);
    return BIKE_LITE_DISCOUNT_INR;
  }
}

/**
 * Effective Bike Lite discount amount (₹) as configured by the Super Admin.
 * Result is cached for `CACHE_TTL_MS`.
 */
export async function loadBikeLiteDiscount(): Promise<number> {
  return cachedRideQuoteValue(CACHE_KEY, loadBikeLiteDiscountUncached, CACHE_TTL_MS);
}
