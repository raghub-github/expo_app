/**
 * Geo-scoped rider PRE-PICKUP (first-mile) compensation resolver.
 *
 * Resolves the effective ₹/km rate + funding for a pickup location from
 * `geo_pre_pickup_compensation` (closest-ancestor-wins via geo_pricing_chain_steps).
 * Returns null when no active override exists on the location's chain — callers then
 * fall back to the global platform_rider_dispatch_strategy_config row.
 *
 * Input is the pickup PINCODE + STATE text (what checkout metadata / store rows carry);
 * we reuse the billing geo resolver (resolveDropGeoRefsFromPincode) to turn that into the
 * geo hierarchy UUIDs, then query the effective-override function at every resolved level
 * — the same robust multi-level strategy as the offer geo resolver. All money logic stays
 * in the backend.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import type { PrePickupFunding } from "./dispatch-strategy-config.js";
import { resolveDropGeoRefsFromPincode } from "../modules/billing/geoRefFromPincode.js";
import type { DropGeoRefByLevel } from "../modules/billing/types.js";

/** Pickup location as text — pincode string ("800001") + state name ("BIHAR"). */
export type PrePickupGeoRefs = {
  pincode?: string | null;
  state?: string | null;
};

export type GeoPrePickupOverride = {
  ratePerKm: number;
  funding: PrePickupFunding;
  /** Customer share (0..100) when funding === 'shared'. */
  customerSharePct: number;
  minAmount: number | null;
  maxAmount: number | null;
  /** Geo level whose row supplied the override (diagnostics). */
  sourceLevel: string;
  sourceRefId: string;
  ruleId: number;
};

/** Levels queried, closest node first. Each query returns the closest ancestor for that node. */
const LOOKUP_LEVELS: (keyof DropGeoRefByLevel)[] = [
  "pincode",
  "post_office",
  "division",
  "district",
  "region",
  "state",
];

const VALID_FUNDING = new Set<PrePickupFunding>(["company", "customer", "shared"]);

function normalizeFunding(raw: unknown): PrePickupFunding {
  const s = String(raw ?? "").trim().toLowerCase();
  return VALID_FUNDING.has(s as PrePickupFunding) ? (s as PrePickupFunding) : "company";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

type EffectiveRow = {
  id: number | string;
  rate_per_km: number | string;
  funding: string;
  customer_share_pct: number | string;
  min_amount: number | string | null;
  max_amount: number | string | null;
  geo_level: string;
  geo_ref_id: string;
};

function mapRow(row: EffectiveRow): GeoPrePickupOverride {
  return {
    ratePerKm: Math.max(0, num(row.rate_per_km)),
    funding: normalizeFunding(row.funding),
    customerSharePct: Math.min(100, Math.max(0, num(row.customer_share_pct))),
    minAmount: numOrNull(row.min_amount),
    maxAmount: numOrNull(row.max_amount),
    sourceLevel: String(row.geo_level),
    sourceRefId: String(row.geo_ref_id),
    ruleId: Number(row.id),
  };
}

/**
 * Effective pre-pickup override for the pickup location, or null when none is configured
 * on the chain. Resolves pincode/state text → geo UUIDs, then queries each resolved level
 * closest-first and returns the first hit — robust to an incomplete pincode→post_office
 * chain (same strategy as the offer geo resolver).
 */
export async function resolveGeoPrePickupOverride(
  input: PrePickupGeoRefs | null | undefined,
  service: DispatchServiceType
): Promise<GeoPrePickupOverride | null> {
  if (!input) return null;
  const pincode = input.pincode ? String(input.pincode).trim() : null;
  const state = input.state ? String(input.state).trim() : null;
  if (!pincode && !state) return null;

  let refs: DropGeoRefByLevel | null = null;
  try {
    refs = await resolveDropGeoRefsFromPincode(pincode, state);
  } catch {
    return null;
  }
  if (!refs) return null;

  const targets: { level: keyof DropGeoRefByLevel; id: string }[] = [];
  for (const level of LOOKUP_LEVELS) {
    const id = refs[level];
    if (id && String(id).trim()) targets.push({ level, id: String(id).trim() });
  }
  if (targets.length === 0) return null;

  const sql = getSql();
  try {
    const results = await Promise.all(
      targets.map(
        (t) =>
          sql<EffectiveRow[]>`
            SELECT id, rate_per_km, funding, customer_share_pct, min_amount, max_amount, geo_level, geo_ref_id
            FROM geo_pre_pickup_comp_effective(${t.level}::geo_pricing_level, ${t.id}::uuid, ${service}::order_type)
            LIMIT 1
          `
      )
    );
    // Closest-first: the first level (most specific starting node) that returns a row wins.
    for (const rows of results) {
      const row = rows[0];
      if (row) return mapRow(row);
    }
    return null;
  } catch {
    // On any DB error, behave as if no override exists → global fallback (safe direction).
    return null;
  }
}
