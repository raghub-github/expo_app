import { getSql } from "../client";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";
export type RiderPayoutServiceType = "food" | "parcel" | "ride";
export type RiderSlabLeg = "pickup" | "drop";
export type RideVehiclePricingType =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

export type RiderPickupSlabRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  pickupPerKm: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RiderDropSlabRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  dropPerKm: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RideCustomerPricingRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  vehicleType: RideVehiclePricingType;
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

function tableFor(service: RiderPayoutServiceType, leg: RiderSlabLeg): string {
  if (service === "food") return leg === "pickup" ? "food_rider_pickup_slabs" : "food_rider_drop_slabs";
  if (service === "parcel") return leg === "pickup" ? "parcel_rider_pickup_slabs" : "parcel_rider_drop_slabs";
  return leg === "pickup" ? "ride_rider_pickup_slabs" : "ride_rider_drop_slabs";
}

function mapPickup(r: Record<string, unknown>): RiderPickupSlabRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    vehicleType: r.vehicle_type ? (String(r.vehicle_type) as RideVehiclePricingType) : null,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    pickupPerKm: Number(r.pickup_per_km),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    waitingStartAfter: Number(r.waiting_start_after ?? 0),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapDrop(r: Record<string, unknown>): RiderDropSlabRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    vehicleType: r.vehicle_type ? (String(r.vehicle_type) as RideVehiclePricingType) : null,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    dropPerKm: Number(r.drop_per_km),
    priority: Number(r.priority ?? 100),
    isActive: r.is_active === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

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

export async function listRiderPickupSlabs(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
}): Promise<RiderPickupSlabRow[]> {
  const sql = getSql();
  const table = tableFor(args.service, "pickup");
  if (args.service === "ride" && args.vehicleType) {
    const rows = await sql.unsafe(`
      SELECT * FROM ${table}
      WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid
        AND vehicle_type = $3::ride_vehicle_pricing_type AND deleted_at IS NULL
      ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
    `, [args.level, args.refId, args.vehicleType]);
    return (rows as Record<string, unknown>[]).map(mapPickup);
  }
  const rows = await sql.unsafe(`
    SELECT * FROM ${table}
    WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `, [args.level, args.refId]);
  return (rows as Record<string, unknown>[]).map(mapPickup);
}

export async function listRiderDropSlabs(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
}): Promise<RiderDropSlabRow[]> {
  const sql = getSql();
  const table = tableFor(args.service, "drop");
  if (args.service === "ride" && args.vehicleType) {
    const rows = await sql.unsafe(`
      SELECT * FROM ${table}
      WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid
        AND vehicle_type = $3::ride_vehicle_pricing_type AND deleted_at IS NULL
      ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
    `, [args.level, args.refId, args.vehicleType]);
    return (rows as Record<string, unknown>[]).map(mapDrop);
  }
  const rows = await sql.unsafe(`
    SELECT * FROM ${table}
    WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `, [args.level, args.refId]);
  return (rows as Record<string, unknown>[]).map(mapDrop);
}

export async function getEffectiveRiderSlabs(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  leg: RiderSlabLeg;
  vehicleType?: RideVehiclePricingType | null;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: RiderPickupSlabRow[] | RiderDropSlabRow[] }> {
  const table = tableFor(args.service, args.leg);
  const sql = getSql();
  const applied = await findEffectiveNode(args.level, args.refId, async (l, id) => {
    if (args.service === "ride" && args.vehicleType) {
      const rows = await sql.unsafe(
        `SELECT 1 FROM ${table} WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid
         AND vehicle_type = $3::ride_vehicle_pricing_type AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [l, id, args.vehicleType]
      );
      return (rows as unknown[]).length > 0;
    }
    const rows = await sql.unsafe(
      `SELECT 1 FROM ${table} WHERE geo_level = $1::geo_pricing_level AND geo_ref_id = $2::uuid
       AND is_active = true AND deleted_at IS NULL LIMIT 1`,
      [l, id]
    );
    return (rows as unknown[]).length > 0;
  });
  if (!applied) return { applied: null, slabs: [] };
  if (args.leg === "pickup") {
    return {
      applied,
      slabs: await listRiderPickupSlabs({
        level: applied.level as GeoHierarchyLevel,
        refId: applied.refId,
        service: args.service,
        vehicleType: args.vehicleType,
      }),
    };
  }
  return {
    applied,
    slabs: await listRiderDropSlabs({
      level: applied.level as GeoHierarchyLevel,
      refId: applied.refId,
      service: args.service,
      vehicleType: args.vehicleType,
    }),
  };
}

export async function insertRiderPickupSlab(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  pickupPerKm: number;
  minCharge: number | null;
  waitingChargePerMin?: number | null;
  waitingStartAfter?: number;
  priority?: number;
  isActive?: boolean;
}): Promise<RiderPickupSlabRow> {
  const sql = getSql();
  const table = tableFor(args.service, "pickup");
  const rows =
    args.service === "ride" && args.vehicleType
      ? await sql.unsafe(
          `INSERT INTO ${table} (
            geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, pickup_per_km, min_charge,
            waiting_charge_per_min, waiting_start_after, priority, is_active
          ) VALUES ($1::geo_pricing_level, $2::uuid, $3::ride_vehicle_pricing_type, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
          [
            args.level,
            args.refId,
            args.vehicleType,
            args.minKm,
            args.maxKm,
            args.baseFare,
            args.pickupPerKm,
            args.minCharge,
            args.waitingChargePerMin ?? null,
            args.waitingStartAfter ?? 0,
            args.priority ?? 100,
            args.isActive ?? true,
          ]
        )
      : await sql.unsafe(
          `INSERT INTO ${table} (
            geo_level, geo_ref_id, min_km, max_km, base_fare, pickup_per_km, min_charge,
            waiting_charge_per_min, waiting_start_after, priority, is_active
          ) VALUES ($1::geo_pricing_level, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            args.level,
            args.refId,
            args.minKm,
            args.maxKm,
            args.baseFare,
            args.pickupPerKm,
            args.minCharge,
            args.waitingChargePerMin ?? null,
            args.waitingStartAfter ?? 0,
            args.priority ?? 100,
            args.isActive ?? true,
          ]
        );
  return mapPickup((rows as Record<string, unknown>[])[0]!);
}

export async function insertRiderDropSlab(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  dropPerKm: number;
  priority?: number;
  isActive?: boolean;
}): Promise<RiderDropSlabRow> {
  const sql = getSql();
  const table = tableFor(args.service, "drop");
  const rows =
    args.service === "ride" && args.vehicleType
      ? await sql.unsafe(
          `INSERT INTO ${table} (geo_level, geo_ref_id, vehicle_type, min_km, max_km, drop_per_km, priority, is_active)
           VALUES ($1::geo_pricing_level, $2::uuid, $3::ride_vehicle_pricing_type, $4, $5, $6, $7, $8) RETURNING *`,
          [args.level, args.refId, args.vehicleType, args.minKm, args.maxKm, args.dropPerKm, args.priority ?? 100, args.isActive ?? true]
        )
      : await sql.unsafe(
          `INSERT INTO ${table} (geo_level, geo_ref_id, min_km, max_km, drop_per_km, priority, is_active)
           VALUES ($1::geo_pricing_level, $2::uuid, $3, $4, $5, $6, $7) RETURNING *`,
          [args.level, args.refId, args.minKm, args.maxKm, args.dropPerKm, args.priority ?? 100, args.isActive ?? true]
        );
  return mapDrop((rows as Record<string, unknown>[])[0]!);
}

export async function updateRiderPickupSlab(
  service: RiderPayoutServiceType,
  id: number,
  patch: Partial<{
    minKm: number;
    maxKm: number | null;
    baseFare: number | null;
    pickupPerKm: number;
    minCharge: number | null;
    waitingChargePerMin: number | null;
    waitingStartAfter: number;
    priority: number;
    isActive: boolean;
  }>
): Promise<RiderPickupSlabRow | null> {
  const sql = getSql();
  const table = tableFor(service, "pickup");
  const rows = await sql.unsafe(
    `UPDATE ${table} SET
      min_km = COALESCE($2, min_km),
      max_km = COALESCE($3, max_km),
      base_fare = COALESCE($4, base_fare),
      pickup_per_km = COALESCE($5, pickup_per_km),
      min_charge = COALESCE($6, min_charge),
      waiting_charge_per_min = COALESCE($7, waiting_charge_per_min),
      waiting_start_after = COALESCE($8, waiting_start_after),
      priority = COALESCE($9, priority),
      is_active = COALESCE($10, is_active),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *`,
    [
      id,
      patch.minKm ?? null,
      patch.maxKm ?? null,
      patch.baseFare ?? null,
      patch.pickupPerKm ?? null,
      patch.minCharge ?? null,
      patch.waitingChargePerMin ?? null,
      patch.waitingStartAfter ?? null,
      patch.priority ?? null,
      patch.isActive ?? null,
    ]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapPickup(row) : null;
}

export async function updateRiderDropSlab(
  service: RiderPayoutServiceType,
  id: number,
  patch: Partial<{
    minKm: number;
    maxKm: number | null;
    dropPerKm: number;
    priority: number;
    isActive: boolean;
  }>
): Promise<RiderDropSlabRow | null> {
  const sql = getSql();
  const table = tableFor(service, "drop");
  const rows = await sql.unsafe(
    `UPDATE ${table} SET
      min_km = COALESCE($2, min_km),
      max_km = COALESCE($3, max_km),
      drop_per_km = COALESCE($4, drop_per_km),
      priority = COALESCE($5, priority),
      is_active = COALESCE($6, is_active),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *`,
    [
      id,
      patch.minKm ?? null,
      patch.maxKm ?? null,
      patch.dropPerKm ?? null,
      patch.priority ?? null,
      patch.isActive ?? null,
    ]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapDrop(row) : null;
}

export async function softDeleteRiderSlab(
  service: RiderPayoutServiceType,
  leg: RiderSlabLeg,
  id: number
): Promise<boolean> {
  const sql = getSql();
  const table = tableFor(service, leg);
  const rows = await sql.unsafe(
    `UPDATE ${table} SET deleted_at = now(), updated_at = now(), is_active = false WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  return (rows as unknown[]).length > 0;
}

// ─── Ride customer pricing ───────────────────────────────────────────────────

function mapRideCustomer(r: Record<string, unknown>): RideCustomerPricingRow {
  return {
    id: Number(r.id),
    geoLevel: String(r.geo_level) as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    vehicleType: String(r.vehicle_type) as RideVehiclePricingType,
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

export async function listRideCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: RideVehiclePricingType;
}): Promise<RideCustomerPricingRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM ride_customer_pricing
    WHERE geo_level = ${args.level}::geo_pricing_level AND geo_ref_id = ${args.refId}::uuid
      AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type AND deleted_at IS NULL
    ORDER BY min_km ASC, max_km ASC NULLS LAST, priority DESC, id ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRideCustomer(r as Record<string, unknown>));
}

export async function getEffectiveRideCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: RideVehiclePricingType;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: RideCustomerPricingRow[] }> {
  const sql = getSql();
  const applied = await findEffectiveNode(args.level, args.refId, async (l, id) => {
    const rows = await sql`
      SELECT 1 FROM ride_customer_pricing
      WHERE geo_level = ${l}::geo_pricing_level AND geo_ref_id = ${id}::uuid
        AND vehicle_type = ${args.vehicleType}::ride_vehicle_pricing_type
        AND is_active = true AND deleted_at IS NULL LIMIT 1
    `;
    return (Array.isArray(rows) ? rows : []).length > 0;
  });
  if (!applied) return { applied: null, slabs: [] };
  return {
    applied,
    slabs: await listRideCustomerPricing({
      level: applied.level as GeoHierarchyLevel,
      refId: applied.refId,
      vehicleType: args.vehicleType,
    }),
  };
}

export async function insertRideCustomerPricing(args: {
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType: RideVehiclePricingType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority?: number;
  isActive?: boolean;
}): Promise<RideCustomerPricingRow> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO ride_customer_pricing (
      geo_level, geo_ref_id, vehicle_type, min_km, max_km, base_fare, per_km_rate, min_charge, priority, is_active
    ) VALUES (
      ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${args.vehicleType}::ride_vehicle_pricing_type,
      ${args.minKm}, ${args.maxKm}, ${args.baseFare}, ${args.perKmRate}, ${args.minCharge},
      ${args.priority ?? 100}, ${args.isActive ?? true}
    ) RETURNING *
  `;
  return mapRideCustomer((Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>);
}

export async function updateRideCustomerPricing(
  id: number,
  patch: Partial<{
    minKm: number;
    maxKm: number | null;
    baseFare: number | null;
    perKmRate: number;
    minCharge: number | null;
    priority: number;
    isActive: boolean;
  }>
): Promise<RideCustomerPricingRow | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE ride_customer_pricing SET
      min_km = COALESCE(${patch.minKm ?? null}, min_km),
      max_km = ${patch.maxKm === undefined ? sql`max_km` : patch.maxKm},
      base_fare = ${patch.baseFare === undefined ? sql`base_fare` : patch.baseFare},
      per_km_rate = COALESCE(${patch.perKmRate ?? null}, per_km_rate),
      min_charge = ${patch.minCharge === undefined ? sql`min_charge` : patch.minCharge},
      priority = COALESCE(${patch.priority ?? null}, priority),
      is_active = COALESCE(${patch.isActive ?? null}, is_active),
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  return row ? mapRideCustomer(row) : null;
}

export async function softDeleteRideCustomerPricing(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    UPDATE ride_customer_pricing SET deleted_at = now(), updated_at = now(), is_active = false
    WHERE id = ${id} AND deleted_at IS NULL RETURNING id
  `;
  return (Array.isArray(rows) ? rows : []).length > 0;
}
