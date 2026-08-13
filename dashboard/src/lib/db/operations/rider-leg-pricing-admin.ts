import { getSql } from "../client";

export type GeoHierarchyLevel =
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";
/** UI service: food | parcel | ride. DB order_type: food | parcel | person_ride. */
export type LegUiService = "food" | "parcel" | "ride";
export type LegDbService = "food" | "parcel" | "person_ride";
export type LegKind = "pre" | "post";
export type LegVehicle = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";
export type LegFunding = "company" | "customer" | "shared";

const toDbService = (s: LegUiService): LegDbService => (s === "ride" ? "person_ride" : s);

export type RiderLegPricingRow = {
  id: number;
  leg: LegKind;
  serviceType: LegDbService;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  vehicleType: LegVehicle | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  minKm: number;
  maxKm: number | null;
  baseAmount: number | null;
  ratePerKm: number;
  minAmount: number | null;
  maxAmount: number | null;
  funding: LegFunding;
  customerSharePct: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

function normFunding(raw: unknown): LegFunding {
  const s = String(raw ?? "company").toLowerCase();
  return s === "customer" || s === "shared" ? (s as LegFunding) : "company";
}
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Record<string, unknown>): RiderLegPricingRow {
  return {
    id: Number(r.id),
    leg: String(r.leg) as LegKind,
    serviceType: String(r.service_type) as LegDbService,
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    vehicleType: r.vehicle_type == null ? null : (String(r.vehicle_type) as LegVehicle),
    weightMinKg: numOrNull(r.weight_min_kg),
    weightMaxKg: numOrNull(r.weight_max_kg),
    minKm: Number(r.min_km),
    maxKm: numOrNull(r.max_km),
    baseAmount: numOrNull(r.base_amount),
    ratePerKm: Number(r.rate_per_km),
    minAmount: numOrNull(r.min_amount),
    maxAmount: numOrNull(r.max_amount),
    funding: normFunding(r.funding),
    customerSharePct: Number(r.customer_share_pct ?? 0),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from),
    effectiveTo: r.effective_to == null ? null : String(r.effective_to),
  };
}

/** All leg rules defined directly at this node (both legs), ordered pre→post, slab asc. */
export async function listRiderLegPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: LegUiService;
}): Promise<RiderLegPricingRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM rider_leg_pricing
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND service_type = ${toDbService(args.service)}::order_type
    ORDER BY leg ASC, vehicle_type NULLS FIRST, priority DESC, min_km ASC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRow(r as Record<string, unknown>));
}

export type RiderLegPricingInput = {
  id?: number | null;
  leg: LegKind;
  level: GeoHierarchyLevel;
  refId: string;
  service: LegUiService;
  vehicleType: LegVehicle | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  minKm: number;
  maxKm: number | null;
  baseAmount: number | null;
  ratePerKm: number;
  minAmount: number | null;
  maxAmount: number | null;
  funding: LegFunding;
  customerSharePct: number;
  priority: number;
  isActive: boolean;
};

export async function upsertRiderLegPricing(args: RiderLegPricingInput): Promise<RiderLegPricingRow> {
  const sql = getSql();
  const svc = toDbService(args.service);
  if (args.id && args.id > 0) {
    const rows = await sql`
      UPDATE rider_leg_pricing SET
        leg = ${args.leg},
        vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type,
        weight_min_kg = ${args.weightMinKg},
        weight_max_kg = ${args.weightMaxKg},
        min_km = ${args.minKm},
        max_km = ${args.maxKm},
        base_amount = ${args.baseAmount},
        rate_per_km = ${args.ratePerKm},
        min_amount = ${args.minAmount},
        max_amount = ${args.maxAmount},
        funding = ${args.funding},
        customer_share_pct = ${args.customerSharePct},
        priority = ${args.priority},
        is_active = ${args.isActive},
        updated_at = now()
      WHERE id = ${args.id}
        AND geo_level = ${args.level}::geo_pricing_level
        AND geo_ref_id = ${args.refId}::uuid
        AND service_type = ${svc}::order_type
      RETURNING *
    `;
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
    if (!row) throw new Error("rider_leg_pricing row not found for update");
    return mapRow(row);
  }
  const rows = await sql`
    INSERT INTO rider_leg_pricing (
      leg, geo_level, geo_ref_id, service_type, vehicle_type, weight_min_kg, weight_max_kg,
      min_km, max_km, base_amount, rate_per_km, min_amount, max_amount, funding,
      customer_share_pct, priority, is_active
    ) VALUES (
      ${args.leg}, ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${svc}::order_type,
      ${args.vehicleType}::ride_vehicle_pricing_type, ${args.weightMinKg}, ${args.weightMaxKg},
      ${args.minKm}, ${args.maxKm}, ${args.baseAmount}, ${args.ratePerKm}, ${args.minAmount},
      ${args.maxAmount}, ${args.funding}, ${args.customerSharePct}, ${args.priority}, ${args.isActive}
    )
    RETURNING *
  `;
  return mapRow((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

export async function deleteRiderLegPricing(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`DELETE FROM rider_leg_pricing WHERE id = ${id} RETURNING id`;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
