import { getSql } from "../../db/client.js";
import type {
  GeoHierarchyLevel,
  RideCustomerPricingRow,
  RideVehiclePricingType,
  RiderPayoutServiceType,
  ServicePayoutRuleRow,
} from "./types.js";

function mapRuleRow(r: Record<string, unknown>): ServicePayoutRuleRow {
  const fundingRaw = String(r.waiting_funding_mode ?? "CUSTOMER_100").toUpperCase();
  const fundingMode =
    fundingRaw === "COMPANY_100" || fundingRaw === "MERCHANT_100" || fundingRaw === "SHARED"
      ? fundingRaw
      : "CUSTOMER_100";
  return {
    id: Number(r.id),
    serviceType: String(r.service_type) as RiderPayoutServiceType,
    vehicleType: r.vehicle_type == null ? null : (String(r.vehicle_type) as RideVehiclePricingType),
    geoLevel: String(r.geo_level),
    geoRefId: String(r.geo_ref_id),
    riderPercentage: Number(r.rider_percentage),
    platformPercentage: Number(r.platform_percentage),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    waitingFreeMinutes: Number(r.waiting_free_minutes ?? 2),
    waitingMaxCharge: r.waiting_max_charge == null ? null : Number(r.waiting_max_charge),
    waitingMaxMinutes: r.waiting_max_minutes == null ? null : Number(r.waiting_max_minutes),
    waitingStartMode:
      String(r.waiting_start_mode ?? "FIXED_GRACE").toUpperCase() === "KPT_PLUS_GRACE"
        ? "KPT_PLUS_GRACE"
        : "FIXED_GRACE",
    waitingKptGraceMinutes:
      r.waiting_kpt_grace_minutes == null ? null : Number(r.waiting_kpt_grace_minutes),
    waitingBulkValueThreshold:
      r.waiting_bulk_value_threshold == null ? null : Number(r.waiting_bulk_value_threshold),
    waitingBulkItemThreshold:
      r.waiting_bulk_item_threshold == null ? null : Number(r.waiting_bulk_item_threshold),
    waitingBulkExtraGraceMinutes:
      r.waiting_bulk_extra_grace_minutes == null ? null : Number(r.waiting_bulk_extra_grace_minutes),
    waitingFundingMode: fundingMode as ServicePayoutRuleRow["waitingFundingMode"],
    waitingCustomerSharePct: Number(r.waiting_customer_share_pct ?? 100),
    waitingCompanySharePct: Number(r.waiting_company_share_pct ?? 0),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
  };
}

async function findEffectiveGeoNode(
  level: GeoHierarchyLevel,
  refId: string,
  existsQuery: (stepLevel: string, stepId: string) => Promise<boolean>
): Promise<{ level: string; refId: string } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string; step_ord: number }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id, step_ord
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    if (await existsQuery(step.step_level, step.step_id)) {
      return { level: step.step_level, refId: step.step_id };
    }
  }
  return null;
}

async function payoutRuleExists(
  level: string,
  refId: string,
  service: RiderPayoutServiceType,
  now: Date,
  vehicleType: RideVehiclePricingType | null | undefined
): Promise<boolean> {
  const sql = getSql();
  // postgres.js with prepare:false cannot bind Date as text → ERR_INVALID_ARG_TYPE.
  const nowIso = now.toISOString();
  const vt = vehicleType ?? null;
  const rows = await sql<{ ok: number }[]>`
    SELECT 1 AS ok FROM service_payout_rules
    WHERE geo_level = ${level}::geo_pricing_level AND geo_ref_id = ${refId}::uuid
      AND service_type = ${service} AND is_active = true AND deleted_at IS NULL
      AND (vehicle_type IS NULL OR ${vt}::ride_vehicle_pricing_type IS NULL OR vehicle_type = ${vt}::ride_vehicle_pricing_type)
      AND (effective_from IS NULL OR effective_from <= ${nowIso}::timestamptz)
      AND (effective_to IS NULL OR effective_to >= ${nowIso}::timestamptz)
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Top rule at this geo node: prefer a vehicle-specific row (matching the queried vehicle)
 * over an all-vehicles row — same "prefer specific" pattern as dynamic_pricing_rules and
 * rider_leg_pricing — THEN highest priority, then oldest id. Vehicle specificity only
 * matters when a vehicle was actually queried; food (no vehicle) only ever sees
 * all-vehicles rows since vehicle_type IS NULL OR vt IS NULL passes every row through.
 */
async function loadTopPayoutRuleAt(
  level: string,
  refId: string,
  service: RiderPayoutServiceType,
  now: Date,
  vehicleType: RideVehiclePricingType | null | undefined
): Promise<ServicePayoutRuleRow | null> {
  const sql = getSql();
  const nowIso = now.toISOString();
  const vt = vehicleType ?? null;
  const rows = await sql`
    SELECT * FROM service_payout_rules
    WHERE geo_level = ${level}::geo_pricing_level AND geo_ref_id = ${refId}::uuid
      AND service_type = ${service} AND is_active = true AND deleted_at IS NULL
      AND (vehicle_type IS NULL OR ${vt}::ride_vehicle_pricing_type IS NULL OR vehicle_type = ${vt}::ride_vehicle_pricing_type)
      AND (effective_from IS NULL OR effective_from <= ${nowIso}::timestamptz)
      AND (effective_to IS NULL OR effective_to >= ${nowIso}::timestamptz)
    ORDER BY (vehicle_type IS NOT NULL) DESC, priority DESC, id ASC
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row ? mapRuleRow(row as Record<string, unknown>) : null;
}

/**
 * Rider Fare Engine v3.0: resolve the effective service_payout_rules row for a
 * geo node, via nearest-ancestor inheritance (geo_pricing_chain_steps), same
 * semantics as the deprecated slab tables. vehicleType (ride/parcel) prefers a
 * vehicle-specific row over an all-vehicles row at the resolved node; food has no
 * vehicle dimension and should omit it (or pass null).
 */
export async function loadEffectiveServicePayoutRule(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
  now?: Date;
}): Promise<{ applied: { level: string; refId: string } | null; rule: ServicePayoutRuleRow | null }> {
  const now = args.now ?? new Date();
  const applied = await findEffectiveGeoNode(args.level, args.refId, (l, id) =>
    payoutRuleExists(l, id, args.service, now, args.vehicleType)
  );
  if (!applied) return { applied: null, rule: null };
  const rule = await loadTopPayoutRuleAt(applied.level, applied.refId, args.service, now, args.vehicleType);
  return { applied, rule };
}

export async function riderHasActiveGmitraMax(riderId: number): Promise<boolean> {
  const sql = getSql();
  try {
    const rows = await sql<{ code: string }[]>`
      SELECT p.code
      FROM rider_subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.rider_id = ${riderId}
        AND s.status = 'active'
        AND p.code = 'GMITRA_MAX'
        AND (
          s.end_date > NOW()
          OR COALESCE(s.auto_wallet_deduction, FALSE) = TRUE
        )
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

function mapRideCustomerRow(r: Record<string, unknown>): RideCustomerPricingRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level),
    geoRefId: String(r.geo_ref_id),
    vehicleType: String(r.vehicle_type) as RideVehiclePricingType,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
  };
}

export async function loadEffectiveRideCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: RideVehiclePricingType;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: RideCustomerPricingRow[] }> {
  const applied = await findEffectiveGeoNode(args.level, args.refId, async (l, id) => {
    const sql = getSql();
    const rows = await sql<{ ok: number }[]>`
      SELECT 1 AS ok FROM ride_customer_pricing
      WHERE geo_level = ${l}::geo_pricing_level AND geo_ref_id = ${id}::uuid
        AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
        AND is_active = true AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length > 0;
  });
  if (!applied) return { applied: null, slabs: [] };
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM ride_customer_pricing
    WHERE geo_level = ${applied.level}::geo_pricing_level AND geo_ref_id = ${applied.refId}::uuid
      AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
      AND is_active = true AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `;
  const slabs = (Array.isArray(rows) ? rows : []).map((r) => mapRideCustomerRow(r as Record<string, unknown>));
  return { applied, slabs };
}

export async function loadEffectiveParcelCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: RideVehiclePricingType;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: RideCustomerPricingRow[] }> {
  const applied = await findEffectiveGeoNode(args.level, args.refId, async (l, id) => {
    const sql = getSql();
    const rows = await sql<{ ok: number }[]>`
      SELECT 1 AS ok FROM parcel_customer_pricing
      WHERE geo_level = ${l}::geo_pricing_level AND geo_ref_id = ${id}::uuid
        AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
        AND is_active = true AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length > 0;
  });
  if (!applied) return { applied: null, slabs: [] };
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM parcel_customer_pricing
    WHERE geo_level = ${applied.level}::geo_pricing_level AND geo_ref_id = ${applied.refId}::uuid
      AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
      AND is_active = true AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `;
  const slabs = (Array.isArray(rows) ? rows : []).map((r) => mapRideCustomerRow(r as Record<string, unknown>));
  return { applied, slabs };
}
