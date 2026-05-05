import { getSql } from "../client";

export type DeliveryActorType = "customer" | "rider";
export type DeliveryServiceType = "food" | "parcel" | "person_ride";
export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";

export type DeliveryRateSlabRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  serviceType: DeliveryServiceType;
  actorType: DeliveryActorType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  surgeMultiplier: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listDeliveryRateSlabs(args: {
  level: GeoHierarchyLevel;
  refId: string;
  serviceType?: DeliveryServiceType;
  actorType?: DeliveryActorType;
}): Promise<DeliveryRateSlabRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: number;
      geo_level: GeoHierarchyLevel;
      geo_ref_id: string;
      service_type: DeliveryServiceType;
      actor_type: DeliveryActorType;
      min_km: string;
      max_km: string | null;
      base_fare: string | null;
      per_km_rate: string;
      min_charge: string | null;
      waiting_charge_per_min: string | null;
      surge_multiplier: string | null;
      priority: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  >`
    SELECT *
    FROM delivery_rate_slabs
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND (${args.serviceType ?? null}::order_type IS NULL OR service_type = ${args.serviceType ?? null}::order_type)
      AND (${args.actorType ?? null}::delivery_actor_type IS NULL OR actor_type = ${args.actorType ?? null}::delivery_actor_type)
    ORDER BY service_type ASC, actor_type ASC, min_km::numeric ASC, max_km::numeric ASC NULLS LAST, priority DESC, id ASC
  `;

  return rows.map((r) => ({
    id: Number(r.id),
    geoLevel: r.geo_level,
    geoRefId: r.geo_ref_id,
    serviceType: r.service_type,
    actorType: r.actor_type,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    surgeMultiplier: r.surge_multiplier == null ? null : Number(r.surge_multiplier),
    priority: Number(r.priority),
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getDeliveryRateSlabById(id: number): Promise<DeliveryRateSlabRow | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: number;
      geo_level: GeoHierarchyLevel;
      geo_ref_id: string;
      service_type: DeliveryServiceType;
      actor_type: DeliveryActorType;
      min_km: string;
      max_km: string | null;
      base_fare: string | null;
      per_km_rate: string;
      min_charge: string | null;
      waiting_charge_per_min: string | null;
      surge_multiplier: string | null;
      priority: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  >`
    SELECT *
    FROM delivery_rate_slabs
    WHERE id = ${id}
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    geoLevel: r.geo_level,
    geoRefId: r.geo_ref_id,
    serviceType: r.service_type,
    actorType: r.actor_type,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    surgeMultiplier: r.surge_multiplier == null ? null : Number(r.surge_multiplier),
    priority: Number(r.priority),
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getEffectiveDeliveryRateSlabs(args: {
  level: GeoHierarchyLevel;
  refId: string;
  serviceType: DeliveryServiceType;
  actorType: DeliveryActorType;
}): Promise<{ applied: { level: string; refId: string } | null; slabs: DeliveryRateSlabRow[] }> {
  const sql = getSql();

  // Find nearest step that has any slabs.
  const appliedRows = await sql<{ step_level: string; step_id: string }[]>`
    SELECT c.step_level::text AS step_level, c.step_id::text AS step_id
    FROM geo_pricing_chain_steps(${args.level}::geo_pricing_level, ${args.refId}::uuid) c
    WHERE EXISTS (
      SELECT 1 FROM delivery_rate_slabs s
      WHERE s.geo_level = c.step_level
        AND s.geo_ref_id = c.step_id
        AND s.service_type = ${args.serviceType}::order_type
        AND s.actor_type = ${args.actorType}::delivery_actor_type
        AND s.is_active = true
    )
    ORDER BY c.step_ord ASC
    LIMIT 1
  `;

  const applied = appliedRows[0] ? { level: appliedRows[0].step_level, refId: appliedRows[0].step_id } : null;
  if (!applied) return { applied: null, slabs: [] };

  const slabs = await listDeliveryRateSlabs({
    level: applied.level as GeoHierarchyLevel,
    refId: applied.refId,
    serviceType: args.serviceType,
    actorType: args.actorType,
  });
  return { applied, slabs };
}

export async function insertDeliveryRateSlab(args: {
  level: GeoHierarchyLevel;
  refId: string;
  serviceType: DeliveryServiceType;
  actorType: DeliveryActorType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin?: number | null;
  surgeMultiplier?: number | null;
  priority?: number;
  isActive?: boolean;
}): Promise<DeliveryRateSlabRow> {
  const sql = getSql();
  const rows = await sql<
    {
      id: number;
      geo_level: GeoHierarchyLevel;
      geo_ref_id: string;
      service_type: DeliveryServiceType;
      actor_type: DeliveryActorType;
      min_km: string;
      max_km: string | null;
      base_fare: string | null;
      per_km_rate: string;
      min_charge: string | null;
      waiting_charge_per_min: string | null;
      surge_multiplier: string | null;
      priority: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  >`
    INSERT INTO delivery_rate_slabs (
      geo_level, geo_ref_id, service_type, actor_type,
      min_km, max_km, base_fare, per_km_rate, min_charge, waiting_charge_per_min, surge_multiplier,
      priority, is_active
    )
    VALUES (
      ${args.level}::geo_pricing_level, ${args.refId}::uuid, ${args.serviceType}::order_type, ${args.actorType}::delivery_actor_type,
      ${args.minKm}, ${args.maxKm}, ${args.baseFare}, ${args.perKmRate}, ${args.minCharge}, ${args.waitingChargePerMin ?? null}, ${args.surgeMultiplier ?? null},
      ${args.priority ?? 100}, ${args.isActive ?? true}
    )
    RETURNING *
  `;
  const r = rows[0]!;
  return {
    id: Number(r.id),
    geoLevel: r.geo_level,
    geoRefId: r.geo_ref_id,
    serviceType: r.service_type,
    actorType: r.actor_type,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    surgeMultiplier: r.surge_multiplier == null ? null : Number(r.surge_multiplier),
    priority: Number(r.priority),
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function updateDeliveryRateSlab(id: number, patch: Partial<{
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  surgeMultiplier: number | null;
  priority: number;
  isActive: boolean;
}>): Promise<DeliveryRateSlabRow | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: number;
      geo_level: GeoHierarchyLevel;
      geo_ref_id: string;
      service_type: DeliveryServiceType;
      actor_type: DeliveryActorType;
      min_km: string;
      max_km: string | null;
      base_fare: string | null;
      per_km_rate: string;
      min_charge: string | null;
      waiting_charge_per_min: string | null;
      surge_multiplier: string | null;
      priority: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  >`
    UPDATE delivery_rate_slabs
    SET
      min_km = COALESCE(${patch.minKm ?? null}, min_km),
      max_km = ${patch.maxKm === undefined ? sql`max_km` : patch.maxKm},
      base_fare = ${patch.baseFare === undefined ? sql`base_fare` : patch.baseFare},
      per_km_rate = COALESCE(${patch.perKmRate ?? null}, per_km_rate),
      min_charge = ${patch.minCharge === undefined ? sql`min_charge` : patch.minCharge},
      waiting_charge_per_min = ${patch.waitingChargePerMin === undefined ? sql`waiting_charge_per_min` : patch.waitingChargePerMin},
      surge_multiplier = ${patch.surgeMultiplier === undefined ? sql`surge_multiplier` : patch.surgeMultiplier},
      priority = COALESCE(${patch.priority ?? null}, priority),
      is_active = COALESCE(${patch.isActive ?? null}, is_active),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    geoLevel: r.geo_level,
    geoRefId: r.geo_ref_id,
    serviceType: r.service_type,
    actorType: r.actor_type,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    surgeMultiplier: r.surge_multiplier == null ? null : Number(r.surge_multiplier),
    priority: Number(r.priority),
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function deleteDeliveryRateSlab(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    DELETE FROM delivery_rate_slabs WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

