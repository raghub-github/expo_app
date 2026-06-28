import { getSql } from "../client";

export type DispatchServiceCode = "food" | "parcel" | "person_ride";

export type RiderVehicleCategoryServiceAssignmentRow = {
  id: number;
  categoryCode: string;
  serviceType: DispatchServiceCode;
  isAssigned: boolean;
};

const SERVICE_CODES: DispatchServiceCode[] = ["food", "parcel", "person_ride"];

export async function listRiderVehicleCategoryServiceAssignments(): Promise<
  RiderVehicleCategoryServiceAssignmentRow[]
> {
  const sql = getSql();
  return sql<RiderVehicleCategoryServiceAssignmentRow[]>`
    SELECT
      id,
      category_code AS "categoryCode",
      service_type AS "serviceType",
      is_assigned AS "isAssigned"
    FROM rider_vehicle_category_service_assignments
    ORDER BY category_code ASC, service_type ASC
  `;
}

export async function upsertRiderVehicleCategoryServiceAssignments(
  patches: Array<{ categoryCode: string; serviceType: DispatchServiceCode; isAssigned: boolean }>
): Promise<RiderVehicleCategoryServiceAssignmentRow[]> {
  const sql = getSql();
  const results: RiderVehicleCategoryServiceAssignmentRow[] = [];

  for (const patch of patches) {
    const categoryCode = patch.categoryCode.trim();
    const serviceType = patch.serviceType;
    if (!categoryCode || !SERVICE_CODES.includes(serviceType)) continue;

    const [row] = await sql<RiderVehicleCategoryServiceAssignmentRow[]>`
      INSERT INTO rider_vehicle_category_service_assignments (
        category_code, service_type, is_assigned, updated_at
      )
      VALUES (${categoryCode}, ${serviceType}, ${patch.isAssigned}, NOW())
      ON CONFLICT (category_code, service_type) DO UPDATE SET
        is_assigned = EXCLUDED.is_assigned,
        updated_at = NOW()
      RETURNING
        id,
        category_code AS "categoryCode",
        service_type AS "serviceType",
        is_assigned AS "isAssigned"
    `;
    if (row) results.push(row);
  }

  return results;
}

export async function ensureDefaultCategoryServiceAssignments(): Promise<void> {
  const defaults: Array<{ categoryCode: string; serviceType: DispatchServiceCode; isAssigned: boolean }> = [
    { categoryCode: "2_wheeler", serviceType: "food", isAssigned: true },
    { categoryCode: "2_wheeler", serviceType: "parcel", isAssigned: true },
    { categoryCode: "2_wheeler", serviceType: "person_ride", isAssigned: true },
    { categoryCode: "3_wheeler", serviceType: "food", isAssigned: false },
    { categoryCode: "3_wheeler", serviceType: "parcel", isAssigned: true },
    { categoryCode: "3_wheeler", serviceType: "person_ride", isAssigned: true },
    { categoryCode: "4_wheeler_non_ac", serviceType: "food", isAssigned: false },
    { categoryCode: "4_wheeler_non_ac", serviceType: "parcel", isAssigned: false },
    { categoryCode: "4_wheeler_non_ac", serviceType: "person_ride", isAssigned: true },
    { categoryCode: "4_wheeler_ac", serviceType: "food", isAssigned: false },
    { categoryCode: "4_wheeler_ac", serviceType: "parcel", isAssigned: false },
    { categoryCode: "4_wheeler_ac", serviceType: "person_ride", isAssigned: true },
  ];
  await upsertRiderVehicleCategoryServiceAssignments(defaults);
}
