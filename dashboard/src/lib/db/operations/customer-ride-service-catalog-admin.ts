import { getSql } from "../client";

export type CustomerRideServiceCatalogRow = {
  code: string;
  label: string;
  subtitle: string | null;
  imageKey: string;
  sortOrder: number;
  isActive: boolean;
  vehicleTypes: string[];
};

export type RideCatalogVehicleRow = {
  vehicleTypeCode: string;
  label: string;
  categoryCode: string | null;
  mapsToVehicleType: string | null;
  sortOrder: number;
  /** Catalog codes currently assigned (bike, bike-lite, auto, …). */
  catalogCodes: string[];
};

export async function listCustomerRideServiceCatalog(): Promise<CustomerRideServiceCatalogRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      code: string;
      label: string;
      subtitle: string | null;
      image_key: string;
      sort_order: number;
      is_active: boolean;
      vehicle_types: string[] | null;
    }[]
  >`
    SELECT
      code,
      label,
      subtitle,
      image_key,
      sort_order,
      is_active,
      vehicle_types
    FROM customer_ride_service_catalog
    WHERE is_active = true
    ORDER BY sort_order ASC, code ASC
  `;
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    subtitle: r.subtitle,
    imageKey: r.image_key,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    vehicleTypes: Array.isArray(r.vehicle_types) ? r.vehicle_types.filter(Boolean) : [],
  }));
}

/** All active Vehicle types with their ride-catalog assignments. */
export async function listRideCatalogVehicleAssignments(): Promise<RideCatalogVehicleRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      vehicle_type_code: string;
      label: string;
      category_code: string | null;
      maps_to_vehicle_type: string | null;
      sort_order: number;
      catalog_codes: string[] | null;
    }[]
  >`
    SELECT
      vt.code AS vehicle_type_code,
      vt.label,
      vt.category_code,
      vt.maps_to_vehicle_type,
      vt.sort_order,
      COALESCE(
        (
          SELECT array_agg(a.catalog_code ORDER BY a.catalog_code)
          FROM ride_catalog_vehicle_type_assignments a
          WHERE a.vehicle_type_code = vt.code
            AND a.is_assigned = true
        ),
        '{}'::text[]
      ) AS catalog_codes
    FROM rider_onboarding_vehicle_types vt
    WHERE vt.is_active = true
    ORDER BY vt.sort_order ASC, vt.label ASC, vt.id ASC
  `;

  return rows.map((r) => ({
    vehicleTypeCode: r.vehicle_type_code,
    label: r.label,
    categoryCode: r.category_code,
    mapsToVehicleType: r.maps_to_vehicle_type,
    sortOrder: r.sort_order,
    catalogCodes: Array.isArray(r.catalog_codes) ? r.catalog_codes.filter(Boolean) : [],
  }));
}

/**
 * Save vehicle → catalog assignments, then rebuild catalog.vehicle_types
 * from maps_to_vehicle_type so ride dispatch keeps working.
 */
export async function saveRideCatalogVehicleAssignments(
  patches: Array<{ vehicleTypeCode: string; catalogCodes: string[] }>
): Promise<{ vehicles: RideCatalogVehicleRow[]; catalog: CustomerRideServiceCatalogRow[] }> {
  const sql = getSql();

  for (const patch of patches) {
    const vehicleTypeCode = patch.vehicleTypeCode.trim();
    if (!vehicleTypeCode) continue;
    const catalogCodes = [
      ...new Set((patch.catalogCodes ?? []).map((c) => c.trim()).filter(Boolean)),
    ];

    await sql`
      UPDATE ride_catalog_vehicle_type_assignments
      SET is_assigned = false, updated_at = now()
      WHERE vehicle_type_code = ${vehicleTypeCode}
    `;

    for (const catalogCode of catalogCodes) {
      await sql`
        INSERT INTO ride_catalog_vehicle_type_assignments (
          vehicle_type_code, catalog_code, is_assigned, updated_at
        )
        VALUES (${vehicleTypeCode}, ${catalogCode}, true, now())
        ON CONFLICT (vehicle_type_code, catalog_code) DO UPDATE SET
          is_assigned = true,
          updated_at = now()
      `;
    }
  }

  // Rebuild customer_ride_service_catalog.vehicle_types from assigned maps_to codes.
  const rebuilt = await sql<{ catalog_code: string; vehicle_types: string[] }[]>`
    SELECT
      c.code AS catalog_code,
      COALESCE(
        array_agg(DISTINCT lower(trim(vt.maps_to_vehicle_type)))
          FILTER (
            WHERE vt.maps_to_vehicle_type IS NOT NULL
              AND trim(vt.maps_to_vehicle_type) <> ''
              AND a.is_assigned = true
          ),
        '{}'::text[]
      ) AS vehicle_types
    FROM customer_ride_service_catalog c
    LEFT JOIN ride_catalog_vehicle_type_assignments a
      ON a.catalog_code = c.code AND a.is_assigned = true
    LEFT JOIN rider_onboarding_vehicle_types vt
      ON vt.code = a.vehicle_type_code AND vt.is_active = true
    GROUP BY c.code
  `;

  for (const row of rebuilt) {
    await sql`
      UPDATE customer_ride_service_catalog
      SET vehicle_types = ${sql.array(row.vehicle_types ?? [])}::text[]
      WHERE code = ${row.catalog_code}
    `;
  }

  const [vehicles, catalog] = await Promise.all([
    listRideCatalogVehicleAssignments(),
    listCustomerRideServiceCatalog(),
  ]);
  return { vehicles, catalog };
}
