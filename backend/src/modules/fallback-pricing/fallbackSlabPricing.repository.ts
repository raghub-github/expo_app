import { getSql } from "../../db/client.js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import type { FallbackSlabRow } from "./types.js";

function mapRow(r: {
  id: number;
  service_type: DeliveryServiceType;
  pricing_side: DeliveryActorType;
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

export async function loadFallbackCustomerSlabs(args: {
  service: DeliveryServiceType;
  vehicleType?: RideVehiclePricingType | null;
}): Promise<FallbackSlabRow[]> {
  const sql = getSql();
  const vehicleType =
    args.service === "person_ride" ? (args.vehicleType ?? null) : null;

  const rows = (await sql`
    SELECT *
    FROM geo_fallback_pricing_slabs
    WHERE deleted_at IS NULL
      AND is_active = true
      AND service_type = ${args.service}::order_type
      AND pricing_side = 'customer'::delivery_actor_type
      AND (
        (${vehicleType}::ride_vehicle_pricing_type IS NULL AND vehicle_type IS NULL)
        OR vehicle_type = ${vehicleType}::ride_vehicle_pricing_type
      )
    ORDER BY min_km::numeric ASC, max_km::numeric ASC NULLS LAST, priority DESC, id ASC
  `) as Parameters<typeof mapRow>[0][];

  return rows.map(mapRow);
}

export function fallbackSlabsToDeliveryRows(
  slabs: FallbackSlabRow[],
  service: DeliveryServiceType
): DeliveryRateSlabRow[] {
  return slabs.map((s) => ({
    id: s.id,
    geoLevel: "state",
    geoRefId: "00000000-0000-0000-0000-000000000000",
    serviceType: service,
    actorType: "customer",
    minKm: s.minKm,
    maxKm: s.maxKm,
    baseFare: s.baseFare,
    perKmRate: s.perKmRate,
    minCharge: s.minCharge,
    waitingChargePerMin: s.waitingChargePerMin,
    surgeMultiplier: null,
    priority: s.priority,
    isActive: s.isActive,
  }));
}
