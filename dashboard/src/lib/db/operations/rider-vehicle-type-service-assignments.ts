import { getSql } from "../client";
import type { DispatchServiceCode } from "./rider-vehicle-category-service-assignments";

export type RiderVehicleTypeServiceAssignmentRow = {
  id: number;
  vehicleTypeCode: string;
  serviceType: DispatchServiceCode;
  isAssigned: boolean;
  mapsToVehicleType?: string | null;
  categoryCode?: string | null;
  vehicleLabel?: string | null;
};

const SERVICE_CODES: DispatchServiceCode[] = ["food", "parcel", "person_ride"];

export async function listRiderVehicleTypeServiceAssignments(): Promise<
  RiderVehicleTypeServiceAssignmentRow[]
> {
  const sql = getSql();
  return sql<RiderVehicleTypeServiceAssignmentRow[]>`
    SELECT
      a.id,
      a.vehicle_type_code AS "vehicleTypeCode",
      a.service_type AS "serviceType",
      a.is_assigned AS "isAssigned",
      vt.maps_to_vehicle_type AS "mapsToVehicleType",
      vt.category_code AS "categoryCode",
      vt.label AS "vehicleLabel"
    FROM rider_onboarding_vehicle_type_service_assignments a
    INNER JOIN rider_onboarding_vehicle_types vt ON vt.code = a.vehicle_type_code
    ORDER BY vt.category_code ASC, vt.sort_order ASC, a.service_type ASC
  `;
}

export async function upsertRiderVehicleTypeServiceAssignments(
  patches: Array<{ vehicleTypeCode: string; serviceType: DispatchServiceCode; isAssigned: boolean }>
): Promise<void> {
  const sql = getSql();
  for (const patch of patches) {
    const vehicleTypeCode = patch.vehicleTypeCode.trim();
    const serviceType = patch.serviceType;
    if (!vehicleTypeCode || !SERVICE_CODES.includes(serviceType)) continue;

    await sql`
      INSERT INTO rider_onboarding_vehicle_type_service_assignments (
        vehicle_type_code, service_type, is_assigned, updated_at
      )
      VALUES (${vehicleTypeCode}, ${serviceType}, ${patch.isAssigned}, NOW())
      ON CONFLICT (vehicle_type_code, service_type) DO UPDATE SET
        is_assigned = EXCLUDED.is_assigned,
        updated_at = NOW()
    `;
  }
}

export async function ensureDefaultVehicleTypeServiceAssignments(): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO rider_onboarding_vehicle_type_service_assignments (vehicle_type_code, service_type, is_assigned)
    SELECT
      vt.code,
      csa.service_type,
      (csa.is_assigned AND vt.is_active)
    FROM rider_onboarding_vehicle_types vt
    INNER JOIN rider_vehicle_category_service_assignments csa
      ON csa.category_code = vt.category_code
    WHERE vt.category_code IS NOT NULL
    ON CONFLICT (vehicle_type_code, service_type) DO NOTHING
  `;
}
