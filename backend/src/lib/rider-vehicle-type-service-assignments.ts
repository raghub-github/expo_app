import { getSql, getDb } from "../db/client.js";
import type { RiderDispatchService } from "./rider-dispatch-service-rules.js";
import {
  getAssignedDispatchServicesForCategories,
  invalidateCategoryServiceAssignmentCache,
} from "./rider-vehicle-category-service-assignments.js";
import { eq, and, asc } from "drizzle-orm";
import { riderOnboardingVehicleTypes } from "../db/schema.js";
import { expandVehicleTypeCodesForCatalogMatch } from "./rider-vehicle-db-map.js";

export type VehicleTypeServiceAssignmentAppRow = {
  vehicleTypeCode: string;
  serviceType: RiderDispatchService;
  isAssigned: boolean;
  mapsToVehicleType: string | null;
  categoryCode: string | null;
  vehicleLabel: string;
};

const DISPATCH_SERVICES: RiderDispatchService[] = ["food", "parcel", "person_ride"];

const APP_VEHICLE_LIST_CACHE_MS = 60_000;
let appVehicleListCache: {
  at: number;
  rows: VehicleTypeServiceAssignmentAppRow[];
} | null = null;

export function invalidateVehicleTypeServiceAssignmentCache(): void {
  appVehicleListCache = null;
  invalidateCategoryServiceAssignmentCache();
}

async function expandVehicleTypeAssignmentKeys(vehicleTypes: string[]): Promise<string[]> {
  const keys = new Set<string>();
  for (const raw of vehicleTypes) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    keys.add(t);
    for (const alias of expandVehicleTypeCodesForCatalogMatch(t)) {
      keys.add(alias.toLowerCase());
    }
  }
  if (keys.size === 0) return [];

  const db = getDb();
  const catalogRows = await db
    .select({
      code: riderOnboardingVehicleTypes.code,
      mapsToVehicleType: riderOnboardingVehicleTypes.mapsToVehicleType,
    })
    .from(riderOnboardingVehicleTypes)
    .where(eq(riderOnboardingVehicleTypes.isActive, true))
    .orderBy(asc(riderOnboardingVehicleTypes.sortOrder));

  for (const vt of [...keys]) {
    for (const row of catalogRows) {
      const code = row.code.trim().toLowerCase();
      const mapsTo = row.mapsToVehicleType?.trim().toLowerCase() ?? "";
      if (vt === code || (mapsTo && vt === mapsTo)) {
        keys.add(code);
        if (mapsTo) keys.add(mapsTo);
      }
    }
  }

  return [...keys];
}

/** True when rider vehicle type(s) match an active onboarding catalog entry. */
async function riderHasOnboardingVehicleCatalogMatch(vehicleTypes: string[]): Promise<boolean> {
  const normalized = await expandVehicleTypeAssignmentKeys(vehicleTypes);
  if (normalized.length === 0) return false;

  const db = getDb();
  const catalogRows = await db
    .select({
      code: riderOnboardingVehicleTypes.code,
      mapsToVehicleType: riderOnboardingVehicleTypes.mapsToVehicleType,
    })
    .from(riderOnboardingVehicleTypes)
    .where(eq(riderOnboardingVehicleTypes.isActive, true));

  for (const vt of normalized) {
    for (const row of catalogRows) {
      const code = row.code.trim().toLowerCase();
      const mapsTo = row.mapsToVehicleType?.trim().toLowerCase() ?? "";
      if (vt === code || (mapsTo && vt === mapsTo)) return true;
    }
  }
  return false;
}

async function loadAssignmentsByMapsToVehicleType(): Promise<
  Map<string, Set<RiderDispatchService>>
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      LOWER(TRIM(vt.maps_to_vehicle_type)) AS "mapsTo",
      LOWER(TRIM(vt.code)) AS "vehicleCode",
      a.service_type AS "serviceType"
    FROM rider_onboarding_vehicle_type_service_assignments a
    INNER JOIN rider_onboarding_vehicle_types vt ON vt.code = a.vehicle_type_code
    INNER JOIN rider_vehicle_category_service_assignments csa
      ON csa.category_code = vt.category_code
      AND csa.service_type = a.service_type
    WHERE a.is_assigned = true
      AND csa.is_assigned = true
      AND vt.is_active = true
  `) as Array<{ mapsTo: string | null; vehicleCode: string | null; serviceType: RiderDispatchService }>;

  const map = new Map<string, Set<RiderDispatchService>>();
  for (const row of rows) {
    const service = row.serviceType;
    if (!DISPATCH_SERVICES.includes(service)) continue;
    for (const rawKey of [row.mapsTo, row.vehicleCode]) {
      const key = rawKey?.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(service);
    }
  }

  return map;
}

export async function listVehicleTypeServiceAssignmentsForApp(): Promise<
  VehicleTypeServiceAssignmentAppRow[]
> {
  if (appVehicleListCache && Date.now() - appVehicleListCache.at < APP_VEHICLE_LIST_CACHE_MS) {
    return appVehicleListCache.rows;
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT
      a.vehicle_type_code AS "vehicleTypeCode",
      a.service_type AS "serviceType",
      a.is_assigned AS "isAssigned",
      vt.maps_to_vehicle_type AS "mapsToVehicleType",
      vt.category_code AS "categoryCode",
      vt.label AS "vehicleLabel"
    FROM rider_onboarding_vehicle_type_service_assignments a
    INNER JOIN rider_onboarding_vehicle_types vt ON vt.code = a.vehicle_type_code
    ORDER BY vt.category_code ASC, vt.sort_order ASC, a.service_type ASC
  `) as VehicleTypeServiceAssignmentAppRow[];
  appVehicleListCache = { at: Date.now(), rows };
  return rows;
}

export async function getAssignedDispatchServicesForVehicleTypes(
  vehicleTypes: string[]
): Promise<RiderDispatchService[]> {
  const normalized = await expandVehicleTypeAssignmentKeys(vehicleTypes);
  if (normalized.length === 0) return [];

  const map = await loadAssignmentsByMapsToVehicleType();
  const merged = new Set<RiderDispatchService>();
  for (const vt of normalized) {
    const assigned = map.get(vt);
    if (assigned) {
      for (const s of assigned) merged.add(s);
    }
  }
  return DISPATCH_SERVICES.filter((s) => merged.has(s));
}

/** Dashboard assignment matrix for the rider's active verified vehicle profile. */
export async function resolveAssignedDispatchServicesForProfile(input: {
  vehicleTypes: string[];
  vehicleCategories: string[];
}): Promise<RiderDispatchService[]> {
  const hasVehicleTypes = input.vehicleTypes.some((v) => v.trim().length > 0);
  if (hasVehicleTypes) {
    const byVehicle = await getAssignedDispatchServicesForVehicleTypes(input.vehicleTypes);
    const catalogMatch = await riderHasOnboardingVehicleCatalogMatch(input.vehicleTypes);
    if (catalogMatch) return byVehicle;
    if (byVehicle.length > 0) return byVehicle;
  }
  return getAssignedDispatchServicesForCategories(input.vehicleCategories);
}

export async function filterDispatchServicesByVehicleAssignments<T extends RiderDispatchService>(
  services: T[],
  input: {
    vehicleTypes: string[];
    vehicleCategories?: Array<string | null | undefined>;
  }
): Promise<T[]> {
  if (services.length === 0) return services;

  const byVehicle = await getAssignedDispatchServicesForVehicleTypes(input.vehicleTypes);
  const allowed =
    byVehicle.length > 0
      ? byVehicle
      : await getAssignedDispatchServicesForCategories(input.vehicleCategories ?? []);

  const hasProfileContext =
    input.vehicleTypes.some((v) => v.trim().length > 0) ||
    (input.vehicleCategories ?? []).some((c) => Boolean(c && String(c).trim()));

  if (allowed.length === 0) {
    return hasProfileContext ? [] : services;
  }
  const allowedSet = new Set(allowed);
  return services.filter((s) => allowedSet.has(s));
}
