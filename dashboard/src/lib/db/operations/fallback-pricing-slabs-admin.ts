import { getSql } from "../client";
import type { RideVehiclePricingType } from "@/lib/geo/ride-state-config-shared";

export type FallbackServiceType = "food" | "parcel" | "person_ride";

export type FallbackSlabRow = {
  id: number;
  serviceType: FallbackServiceType;
  pricingSide: "customer" | "rider";
  vehicleType: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: {
  id: number;
  service_type: FallbackServiceType;
  pricing_side: "customer" | "rider";
  vehicle_type: RideVehiclePricingType | null;
  min_km: string;
  max_km: string | null;
  base_fare: string | null;
  per_km_rate: string;
  min_charge: string | null;
  waiting_charge_per_min: string | null;
  waiting_start_after: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): FallbackSlabRow {
  return {
    id: Number(r.id),
    serviceType: r.service_type,
    pricingSide: r.pricing_side,
    vehicleType: r.vehicle_type,
    minKm: Number(r.min_km),
    maxKm: r.max_km == null ? null : Number(r.max_km),
    baseFare: r.base_fare == null ? null : Number(r.base_fare),
    perKmRate: Number(r.per_km_rate),
    minCharge: r.min_charge == null ? null : Number(r.min_charge),
    waitingChargePerMin: r.waiting_charge_per_min == null ? null : Number(r.waiting_charge_per_min),
    waitingStartAfter: Number(r.waiting_start_after ?? 0),
    priority: Number(r.priority),
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listFallbackPricingSlabs(args: {
  serviceType: FallbackServiceType;
  vehicleType?: RideVehiclePricingType | null;
  pricingSide?: "customer" | "rider";
}): Promise<FallbackSlabRow[]> {
  const sql = getSql();
  const vehicleType = args.serviceType === "person_ride" ? (args.vehicleType ?? null) : null;
  const pricingSide = args.pricingSide ?? "customer";

  const rows = await sql<
    Parameters<typeof mapRow>[0][]
  >`
    SELECT *
    FROM geo_fallback_pricing_slabs
    WHERE deleted_at IS NULL
      AND service_type = ${args.serviceType}::order_type
      AND pricing_side = ${pricingSide}::delivery_actor_type
      AND (
        (${vehicleType}::ride_vehicle_pricing_type IS NULL AND vehicle_type IS NULL)
        OR vehicle_type = ${vehicleType}::ride_vehicle_pricing_type
      )
    ORDER BY min_km::numeric ASC, max_km::numeric ASC NULLS LAST, priority DESC, id ASC
  `;

  return rows.map(mapRow);
}

export async function getFallbackPricingSlabById(id: number): Promise<FallbackSlabRow | null> {
  const sql = getSql();
  const rows = await sql<Parameters<typeof mapRow>[0][]>`
    SELECT * FROM geo_fallback_pricing_slabs WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `;
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function insertFallbackPricingSlab(args: {
  serviceType: FallbackServiceType;
  vehicleType?: RideVehiclePricingType | null;
  pricingSide?: "customer" | "rider";
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin?: number | null;
  waitingStartAfter?: number;
  priority?: number;
  isActive?: boolean;
}): Promise<FallbackSlabRow> {
  const sql = getSql();
  const vehicleType = args.serviceType === "person_ride" ? (args.vehicleType ?? null) : null;
  const rows = await sql<Parameters<typeof mapRow>[0][]>`
    INSERT INTO geo_fallback_pricing_slabs (
      service_type, pricing_side, vehicle_type,
      min_km, max_km, base_fare, per_km_rate, min_charge,
      waiting_charge_per_min, waiting_start_after,
      priority, is_active
    ) VALUES (
      ${args.serviceType}::order_type,
      ${args.pricingSide ?? "customer"}::delivery_actor_type,
      ${vehicleType}::ride_vehicle_pricing_type,
      ${args.minKm}, ${args.maxKm}, ${args.baseFare}, ${args.perKmRate}, ${args.minCharge},
      ${args.waitingChargePerMin ?? null}, ${args.waitingStartAfter ?? 0},
      ${args.priority ?? 100}, ${args.isActive ?? true}
    )
    RETURNING *
  `;
  return mapRow(rows[0]!);
}

export async function updateFallbackPricingSlab(
  id: number,
  patch: Partial<{
    minKm: number;
    maxKm: number | null;
    baseFare: number | null;
    perKmRate: number;
    minCharge: number | null;
    waitingChargePerMin: number | null;
    waitingStartAfter: number;
    priority: number;
    isActive: boolean;
  }>
): Promise<FallbackSlabRow | null> {
  const sql = getSql();
  const existing = await getFallbackPricingSlabById(id);
  if (!existing) return null;

  const rows = await sql<Parameters<typeof mapRow>[0][]>`
    UPDATE geo_fallback_pricing_slabs
    SET
      min_km = ${patch.minKm ?? existing.minKm},
      max_km = ${patch.maxKm !== undefined ? patch.maxKm : existing.maxKm},
      base_fare = ${patch.baseFare !== undefined ? patch.baseFare : existing.baseFare},
      per_km_rate = ${patch.perKmRate ?? existing.perKmRate},
      min_charge = ${patch.minCharge !== undefined ? patch.minCharge : existing.minCharge},
      waiting_charge_per_min = ${
        patch.waitingChargePerMin !== undefined ? patch.waitingChargePerMin : existing.waitingChargePerMin
      },
      waiting_start_after = ${patch.waitingStartAfter ?? existing.waitingStartAfter},
      priority = ${patch.priority ?? existing.priority},
      is_active = ${patch.isActive ?? existing.isActive},
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function softDeleteFallbackPricingSlab(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    UPDATE geo_fallback_pricing_slabs
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}
