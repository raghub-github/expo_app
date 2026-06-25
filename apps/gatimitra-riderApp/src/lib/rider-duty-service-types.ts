import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";
import { RIDER_SERVICE_TYPE_VALUES } from "@/src/lib/rider-vehicle-form";
import type { GeoServiceAvailability } from "@/src/services/geoServices.service";
import { riderVehicleBlocksFoodDispatch } from "@/src/lib/rider-dispatch-service-rules";
import { filterServicesByVehicleAssignments } from "@/src/lib/rider-category-service-assignments";

export type RiderServiceFilter = "all" | RiderServiceTypeValue;

export function isRiderServiceTypeValue(value: string): value is RiderServiceTypeValue {
  return (RIDER_SERVICE_TYPE_VALUES as readonly string[]).includes(value);
}

export function geoAvailabilityToRiderServices(
  availability: GeoServiceAvailability | null | undefined,
): RiderServiceTypeValue[] | null {
  if (!availability) return null;
  if (!availability.found) return [];
  const out: RiderServiceTypeValue[] = [];
  if (availability.food) out.push("food");
  if (availability.parcel) out.push("parcel");
  if (availability.ride) out.push("person_ride");
  return out;
}

export function normalizeVehicleServiceTypes(
  serviceTypes: string[] | null | undefined,
): RiderServiceTypeValue[] {
  return (serviceTypes ?? []).filter(isRiderServiceTypeValue);
}

export function computeEligibleDutyServices(args: {
  selectedServices: RiderServiceTypeValue[];
  geoEnabled: RiderServiceTypeValue[] | null;
  vehicleServices: RiderServiceTypeValue[];
  blockedServices: RiderServiceTypeValue[];
  vehicleType?: string | null;
  vehicleCategoryCode?: string | null;
  categoryServiceByCode?: Record<string, RiderServiceTypeValue[]>;
  vehicleServiceByMapsToType?: Record<string, RiderServiceTypeValue[]>;
}): RiderServiceTypeValue[] {
  const pool = buildEligibleServicePool(args);
  const picked = args.selectedServices.filter((s) => pool.includes(s));
  return picked.length > 0 ? picked : pool;
}

export function buildEligibleServicePool(args: {
  geoEnabled: RiderServiceTypeValue[] | null;
  vehicleServices: RiderServiceTypeValue[];
  blockedServices: RiderServiceTypeValue[];
  vehicleType?: string | null;
  vehicleCategoryCode?: string | null;
  categoryServiceByCode?: Record<string, RiderServiceTypeValue[]>;
  vehicleServiceByMapsToType?: Record<string, RiderServiceTypeValue[]>;
}): RiderServiceTypeValue[] {
  let pool = args.vehicleServices.filter((s) => !args.blockedServices.includes(s));
  if (args.geoEnabled != null) {
    pool = pool.filter((s) => args.geoEnabled!.includes(s));
  }
  if (args.vehicleServiceByMapsToType || (args.categoryServiceByCode && args.vehicleCategoryCode)) {
    pool = filterServicesByVehicleAssignments(
      pool,
      args.vehicleType ?? null,
      args.vehicleServiceByMapsToType,
      args.vehicleCategoryCode ?? null,
      args.categoryServiceByCode ?? {}
    );
  } else if (args.vehicleType && riderVehicleBlocksFoodDispatch(args.vehicleType)) {
    pool = pool.filter((s) => s !== "food");
  }
  return pool;
}

export function normalizeSelectedServices(
  selected: RiderServiceTypeValue[],
  eligiblePool: RiderServiceTypeValue[],
): RiderServiceTypeValue[] {
  const picked = selected.filter((s) => eligiblePool.includes(s));
  if (picked.length > 0) return picked;
  return eligiblePool;
}

export function toggleSelectedService(
  selected: RiderServiceTypeValue[],
  service: RiderServiceTypeValue,
  eligiblePool: RiderServiceTypeValue[],
): RiderServiceTypeValue[] {
  if (!eligiblePool.includes(service)) return selected;
  const isOn = selected.includes(service);
  if (isOn) {
    const next = selected.filter((s) => s !== service);
    return next.length > 0 ? next : selected;
  }
  return [...selected, service].filter((s) => eligiblePool.includes(s));
}

export function migrateLegacyServiceFilter(
  legacy: RiderServiceFilter,
  eligiblePool: RiderServiceTypeValue[],
): RiderServiceTypeValue[] {
  if (legacy === "all") return eligiblePool;
  return eligiblePool.includes(legacy) ? [legacy] : eligiblePool;
}

export function inferSelectedFromAllowedServices(
  allowed: RiderServiceTypeValue[],
  eligiblePool: RiderServiceTypeValue[],
): RiderServiceTypeValue[] {
  const picked = allowed.filter((s) => eligiblePool.includes(s));
  return picked.length > 0 ? picked : eligiblePool;
}

export function selectionMatchesPool(
  selected: RiderServiceTypeValue[],
  eligiblePool: RiderServiceTypeValue[],
): boolean {
  if (selected.length !== eligiblePool.length) return false;
  const a = [...selected].sort().join(",");
  const b = [...eligiblePool].sort().join(",");
  return a === b;
}

/** @deprecated single-select helper kept for storage migration */
export function computeServiceFilterOptions(args: {
  geoEnabled: RiderServiceTypeValue[] | null;
  vehicleServices: RiderServiceTypeValue[];
  blockedServices: RiderServiceTypeValue[];
  vehicleType?: string | null;
}): RiderServiceFilter[] {
  const eligible = buildEligibleServicePool(args);
  if (eligible.length === 0) return [];
  if (eligible.length === 1) return [eligible[0]!];
  return ["all", ...eligible];
}
