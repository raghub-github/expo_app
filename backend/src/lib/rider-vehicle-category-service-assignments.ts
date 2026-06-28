import { getSql } from "../db/client.js";
import type { RiderDispatchService } from "./rider-dispatch-service-rules.js";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderOnboardingVehicleTypes } from "../db/schema.js";

export type CategoryServiceAssignmentRow = {
  categoryCode: string;
  serviceType: RiderDispatchService;
  isAssigned: boolean;
};

const DISPATCH_SERVICES: RiderDispatchService[] = ["food", "parcel", "person_ride"];

export function invalidateCategoryServiceAssignmentCache(): void {
  // Assignments are read fresh from DB on each dispatch decision (small tables).
}

/** Map legacy / display vehicle_category labels to onboarding category codes. */
export function normalizeOnboardingCategoryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (c === "2_wheeler" || c === "3_wheeler" || c === "4_wheeler_non_ac" || c === "4_wheeler_ac") {
    return c;
  }
  if (c === "4_wheeler") return "4_wheeler_non_ac";
  if (c === "bike" || c === "bicycle" || c === "scooter") return "2_wheeler";
  if (c === "auto") return "3_wheeler";
  if (c === "cab" || c === "taxi" || c === "car" || c === "ev_car") return "4_wheeler_ac";
  return c;
}

async function loadCategoryAssignmentsMap(): Promise<Map<string, Set<RiderDispatchService>>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT category_code AS "categoryCode", service_type AS "serviceType", is_assigned AS "isAssigned"
    FROM rider_vehicle_category_service_assignments
    WHERE is_assigned = true
  `) as CategoryServiceAssignmentRow[];

  const map = new Map<string, Set<RiderDispatchService>>();
  for (const row of rows) {
    const code = normalizeOnboardingCategoryCode(row.categoryCode);
    const service = row.serviceType;
    if (!code || !DISPATCH_SERVICES.includes(service)) continue;
    if (!map.has(code)) map.set(code, new Set());
    map.get(code)!.add(service);
  }

  return map;
}

export type CategoryServiceAssignmentAppRow = {
  categoryCode: string;
  serviceType: RiderDispatchService;
  isAssigned: boolean;
};

/** Full matrix for rider app / dashboard (includes disabled rows). */
export async function listCategoryServiceAssignmentsForApp(): Promise<CategoryServiceAssignmentAppRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      category_code AS "categoryCode",
      service_type AS "serviceType",
      is_assigned AS "isAssigned"
    FROM rider_vehicle_category_service_assignments
    ORDER BY category_code ASC, service_type ASC
  `) as CategoryServiceAssignmentAppRow[];
  return rows;
}

export async function resolveVehicleOnboardingCategoryCode(
  vehicleType: string,
  explicitCategory?: string | null
): Promise<string | null> {
  const fromExplicit = normalizeOnboardingCategoryCode(explicitCategory);
  if (
    fromExplicit === "2_wheeler" ||
    fromExplicit === "3_wheeler" ||
    fromExplicit === "4_wheeler_non_ac" ||
    fromExplicit === "4_wheeler_ac" ||
    fromExplicit === "4_wheeler"
  ) {
    return fromExplicit === "4_wheeler" ? "4_wheeler_non_ac" : fromExplicit;
  }

  const code = vehicleType.trim().toLowerCase();
  if (!code) return null;

  const db = getDb();
  const [byMap] = await db
    .select({ categoryCode: riderOnboardingVehicleTypes.categoryCode })
    .from(riderOnboardingVehicleTypes)
    .where(
      and(
        eq(riderOnboardingVehicleTypes.isActive, true),
        eq(riderOnboardingVehicleTypes.mapsToVehicleType, code)
      )
    )
    .orderBy(asc(riderOnboardingVehicleTypes.sortOrder))
    .limit(1);

  if (byMap?.categoryCode) {
    return normalizeOnboardingCategoryCode(byMap.categoryCode);
  }

  return normalizeOnboardingCategoryCode(code);
}

/** Union of assigned services across the rider's active vehicle categories. */
export async function getAssignedDispatchServicesForCategories(
  vehicleCategories: Array<string | null | undefined>
): Promise<RiderDispatchService[]> {
  const normalized = new Set<string>();
  for (const raw of vehicleCategories) {
    const code = normalizeOnboardingCategoryCode(raw);
    if (code) normalized.add(code);
  }
  if (normalized.size === 0) return [];

  const map = await loadCategoryAssignmentsMap();
  const merged = new Set<RiderDispatchService>();
  for (const code of normalized) {
    const assigned = map.get(code);
    if (assigned) {
      for (const s of assigned) merged.add(s);
    }
  }
  return DISPATCH_SERVICES.filter((s) => merged.has(s));
}

export async function filterDispatchServicesByCategoryAssignments<T extends RiderDispatchService>(
  services: T[],
  vehicleCategories: Array<string | null | undefined>
): Promise<T[]> {
  if (services.length === 0) return services;
  const allowed = await getAssignedDispatchServicesForCategories(vehicleCategories);
  const hasProfileContext = vehicleCategories.some((c) => Boolean(c && String(c).trim()));
  if (allowed.length === 0) {
    return hasProfileContext ? [] : services;
  }
  const allowedSet = new Set(allowed);
  return services.filter((s) => allowedSet.has(s));
}
