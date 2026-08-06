import { getSql } from "../client";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";
export type ParcelVehiclePricingType =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

export type ParcelCustomerPricingRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  vehicleType: ParcelVehiclePricingType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

async function findEffectiveNode(
  level: GeoHierarchyLevel,
  refId: string,
  existsSql: (stepLevel: string, stepId: string) => Promise<boolean>
): Promise<{ level: string; refId: string } | null> {
  const sql = getSql();
  const chain = await sql<{ step_level: string; step_id: string }[]>`
    SELECT step_level::text AS step_level, step_id::text AS step_id
    FROM geo_pricing_chain_steps(${level}::geo_pricing_level, ${refId}::uuid)
    ORDER BY step_ord ASC
  `;
  for (const step of chain) {
    if (await existsSql(step.step_level, step.step_id)) return { level: step.step_level, refId: step.step_id };
  }
  return null;
}

function mapParcelCustomer(r: Record<string, unknown>): ParcelCustomerPricingRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    vehicleType: String(r.vehicle_type) as ParcelVehiclePricingType,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getParcelCustomerPricingById(id: number): Promise<ParcelCustomerPricingRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM parcel_customer_pricing WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapParcelCustomer(row) : null;
}

export async function listParcelCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: ParcelVehiclePricingType;
}): Promise<ParcelCustomerPricingRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM parcel_customer_pricing
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapParcelCustomer(r as Record<string, unknown>));
}

export async function getEffectiveParcelCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: ParcelVehiclePricingType;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: ParcelCustomerPricingRow[] }> {
  const sql = getSql();
  const applied = await findEffectiveNode(args.level, args.refId, async (l, id) => {
    const rows = await sql`
      SELECT 1 FROM parcel_customer_pricing
      WHERE geo_level = ${l}::geo_pricing_level AND geo_ref_id = ${id}::uuid
        AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
        AND is_active = true AND deleted_at IS NULL LIMIT 1
    `;
    return (Array.isArray(rows) ? rows : []).length > 0;
  });
  if (!applied) return { applied: null, slabs: [] };
  return {
    applied,
    slabs: await listParcelCustomerPricing({
      level: applied.level as GeoHierarchyLevel,
      refId: applied.refId,
      vehicleType: args.vehicleType,
    }),
  };
}

export async function insertParcelCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: ParcelVehiclePricingType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority?: number;
  isActive?: boolean;
}): Promise<ParcelCustomerPricingRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO parcel_customer_pricing (
      geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES (
      ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${args.vehicleType}::ride_vehicle_pricing_type,
      ${args.minKm}, ${args.maxKm}, ${args.baseFare}, ${args.perKmRate}, ${args.minCharge},
      ${args.priority ?? 100}, ${args.isActive ?? true}
    ) RETURNING *
  `;
  return mapParcelCustomer((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

export async function updateParcelCustomerPricing(
  id: number,
  patch: {
    minKm: number;
    maxKm: number | null;
    baseFare: number | null;
    perKmRate: number;
    minCharge: number | null;
    priority: number;
    isActive: boolean;
  }
): Promise<ParcelCustomerPricingRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE parcel_customer_pricing SET
      min_km = ${patch.minKm},
      max_km = ${patch.maxKm},
      base_fare = ${patch.baseFare},
      per_km_rate = ${patch.perKmRate},
      min_charge = ${patch.minCharge},
      priority = ${patch.priority},
      is_active = ${patch.isActive},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapParcelCustomer(row) : null;
}

export async function softDeleteParcelCustomerPricing(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE parcel_customer_pricing SET deleted_at = now(), updated_at = now(), is_active = false
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
