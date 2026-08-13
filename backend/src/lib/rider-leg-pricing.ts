/**
 * Independent rider LEG pricing resolver (v3.2) — pre-pickup (rider→pickup) and
 * post-pickup (pickup→drop) priced SEPARATELY from their own `rider_leg_pricing` rules.
 *
 * Each leg resolves the closest-ancestor active rule for (leg, service, vehicle, weight,
 * distance-slab) via `rider_leg_pricing_effective`, then computes the raw entitlement:
 *     raw = clamp(base_amount + rate_per_km × leg_km, min_amount, max_amount)
 *
 * The two legs NEVER share a rate or a rule — pre uses its own pre-leg rules and its own
 * rider→pickup distance; post uses its own post-leg rules and its own pickup→drop distance.
 * The reconciliation against the rider % pool happens in `reconcileRiderLegs` (shared engine).
 *
 * Mirrors geo-pre-pickup-config.ts: pincode/state text → geo UUIDs (or pickup lat/lng
 * fallback via the cached reverse-geocoder), query each resolved level closest-first, take
 * the first hit. All money logic stays in the backend.
 */

import { getSql } from "../db/client.js";
import { clampLegAmount, type PrePickupFunding } from "@gatimitra/slab-pricing";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import { resolveDropGeoRefsFromPincode } from "../modules/billing/geoRefFromPincode.js";
import { resolveGeoLocation } from "../modules/billing/geoLocationResolver.js";
import type { DropGeoRefByLevel } from "../modules/billing/types.js";

export type RiderLegKind = "pre" | "post";

/** Vehicle pricing type (must match the ride_vehicle_pricing_type enum). Null = all vehicles. */
export type LegVehicleType =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac"
  | null;

export type LegGeoRefs = {
  pincode?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ResolvedRiderLeg = {
  leg: RiderLegKind;
  /** raw entitlement = clamp(base + rate×km, min, max). */
  rawAmount: number;
  distanceKm: number;
  ratePerKm: number;
  baseAmount: number;
  minAmount: number | null;
  maxAmount: number | null;
  funding: PrePickupFunding;
  customerSharePct: number;
  ruleId: number | null;
  sourceLevel: string | null;
  sourceRefId: string | null;
  /** True when a real rule matched; false when no rule → rawAmount 0 (caller falls back). */
  matched: boolean;
};

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

type EffectiveLegRow = {
  id: number | string;
  base_amount: number | string | null;
  rate_per_km: number | string;
  min_amount: number | string | null;
  max_amount: number | string | null;
  funding: string;
  customer_share_pct: number | string;
  geo_level: string;
  geo_ref_id: string;
};

function emptyLeg(leg: RiderLegKind, distanceKm: number): ResolvedRiderLeg {
  return {
    leg,
    rawAmount: 0,
    distanceKm,
    ratePerKm: 0,
    baseAmount: 0,
    minAmount: null,
    maxAmount: null,
    funding: "company",
    customerSharePct: 0,
    ruleId: null,
    sourceLevel: null,
    sourceRefId: null,
    matched: false,
  };
}

function mapLegRow(row: EffectiveLegRow, leg: RiderLegKind, distanceKm: number): ResolvedRiderLeg {
  const base = Math.max(0, num(row.base_amount));
  const rate = Math.max(0, num(row.rate_per_km));
  const minAmount = numOrNull(row.min_amount);
  const maxAmount = numOrNull(row.max_amount);
  return {
    leg,
    rawAmount: clampLegAmount(base + rate * distanceKm, minAmount, maxAmount),
    distanceKm,
    ratePerKm: rate,
    baseAmount: base,
    minAmount,
    maxAmount,
    funding: normalizeFunding(row.funding),
    customerSharePct: Math.min(100, Math.max(0, num(row.customer_share_pct))),
    ruleId: Number(row.id),
    sourceLevel: String(row.geo_level),
    sourceRefId: String(row.geo_ref_id),
    matched: true,
  };
}

/**
 * Resolve one leg's independent price for a location + distance. Returns a leg with
 * matched=false (rawAmount 0) when no rule is configured on the geo chain — the caller
 * then falls back (post → pool remainder; pre → legacy geo_pre_pickup_compensation).
 */
export async function resolveRiderLegPricing(args: {
  leg: RiderLegKind;
  service: DispatchServiceType;
  vehicleType?: LegVehicleType;
  weightKg?: number | null;
  distanceKm: number;
  geo: LegGeoRefs | null | undefined;
  /** Direct geo node (dashboard knows level+refId) — skips pincode/coord resolution. */
  geoNode?: { level: string; refId: string } | null;
}): Promise<ResolvedRiderLeg> {
  const distanceKm = Math.max(0, num(args.distanceKm));
  const leg = args.leg;
  const vehicle = args.vehicleType ?? null;
  const weight = args.weightKg == null ? null : Number(args.weightKg);

  // Direct-node mode: query the leg rule at the given node (closest-ancestor from there).
  if (args.geoNode?.level && args.geoNode?.refId) {
    const sql = getSql();
    try {
      const rows = await sql<EffectiveLegRow[]>`
        SELECT id, base_amount, rate_per_km, min_amount, max_amount, funding,
               customer_share_pct, geo_level, geo_ref_id
        FROM rider_leg_pricing_effective(
          ${leg}::text,
          ${String(args.geoNode.level)}::geo_pricing_level,
          ${String(args.geoNode.refId)}::uuid,
          ${args.service}::order_type,
          ${vehicle}::ride_vehicle_pricing_type,
          ${weight}::numeric,
          ${distanceKm}::numeric
        )
        LIMIT 1
      `;
      return rows[0] ? mapLegRow(rows[0], leg, distanceKm) : emptyLeg(leg, distanceKm);
    } catch {
      return emptyLeg(leg, distanceKm);
    }
  }

  if (!args.geo) return emptyLeg(leg, distanceKm);

  const pincode = args.geo.pincode ? String(args.geo.pincode).trim() : null;
  const state = args.geo.state ? String(args.geo.state).trim() : null;
  const lat = args.geo.latitude == null ? NaN : Number(args.geo.latitude);
  const lng = args.geo.longitude == null ? NaN : Number(args.geo.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!pincode && !state && !hasCoords) return emptyLeg(leg, distanceKm);

  let refs: DropGeoRefByLevel | null = null;
  try {
    if (pincode || state) refs = await resolveDropGeoRefsFromPincode(pincode, state);
    if (!refs && hasCoords) {
      const geo = await resolveGeoLocation({ latitude: lat, longitude: lng });
      refs = geo.refs;
    }
  } catch {
    return emptyLeg(leg, distanceKm);
  }
  if (!refs) return emptyLeg(leg, distanceKm);

  const targets: { level: keyof DropGeoRefByLevel; id: string }[] = [];
  for (const level of LOOKUP_LEVELS) {
    const id = refs[level];
    if (id && String(id).trim()) targets.push({ level, id: String(id).trim() });
  }
  if (targets.length === 0) return emptyLeg(leg, distanceKm);

  const sql = getSql();
  try {
    const results = await Promise.all(
      targets.map(
        (t) =>
          sql<EffectiveLegRow[]>`
            SELECT id, base_amount, rate_per_km, min_amount, max_amount, funding,
                   customer_share_pct, geo_level, geo_ref_id
            FROM rider_leg_pricing_effective(
              ${leg}::text,
              ${t.level}::geo_pricing_level,
              ${t.id}::uuid,
              ${args.service}::order_type,
              ${vehicle}::ride_vehicle_pricing_type,
              ${weight}::numeric,
              ${distanceKm}::numeric
            )
            LIMIT 1
          `
      )
    );
    for (const rows of results) {
      if (rows[0]) return mapLegRow(rows[0], leg, distanceKm);
    }
    return emptyLeg(leg, distanceKm);
  } catch {
    return emptyLeg(leg, distanceKm);
  }
}
