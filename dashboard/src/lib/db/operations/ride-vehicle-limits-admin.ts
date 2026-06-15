import { getSql } from "../client";
import type {
  RideVehicleLimitRow,
  RideVehiclePricingType,
} from "@/lib/geo/ride-state-config-shared";

export type { RideVehicleLimitRow, RideVehiclePricingType } from "@/lib/geo/ride-state-config-shared";
export {
  RIDE_VEHICLE_LIMIT_LABELS,
  RIDE_VEHICLE_LIMIT_TYPES,
} from "@/lib/geo/ride-state-config-shared";

function mapRow(r: Record<string, unknown>): RideVehicleLimitRow {
  return {
    id: Number(r.id),
    stateId: String(r.state_id),
    vehicleType: String(r.vehicle_type) as RideVehiclePricingType,
    maxDistanceKm: Number(r.max_distance_km),
    isEnabled: r.is_enabled === true,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function listRideVehicleLimits(stateId: string): Promise<RideVehicleLimitRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM ride_vehicle_limits
    WHERE state_id = ${stateId}::uuid
    ORDER BY vehicle_type ASC
  `;
  return (Array.isArray(rows) ? rows : []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function upsertRideVehicleLimit(args: {
  stateId: string;
  vehicleType: RideVehiclePricingType;
  maxDistanceKm: number;
  isEnabled?: boolean;
}): Promise<RideVehicleLimitRow> {
  if (args.maxDistanceKm <= 0) throw new Error("Max distance must be > 0");
  const sql = getSql();
  const rows = await sql`
    INSERT INTO ride_vehicle_limits (state_id, vehicle_type, max_distance_km, is_enabled)
    VALUES (${args.stateId}::uuid, ${args.vehicleType}::ride_vehicle_pricing_type, ${args.maxDistanceKm}, ${args.isEnabled ?? true})
    ON CONFLICT (state_id, vehicle_type) DO UPDATE SET
      max_distance_km = EXCLUDED.max_distance_km,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = now()
    RETURNING *
  `;
  return mapRow((rows as Record<string, unknown>[])[0]!);
}

export async function deleteRideVehicleLimit(stateId: string, vehicleType: RideVehiclePricingType): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM ride_vehicle_limits
    WHERE state_id = ${stateId}::uuid AND vehicle_type = ${vehicleType}::ride_vehicle_pricing_type
    RETURNING id
  `;
  return rows.length > 0;
}
