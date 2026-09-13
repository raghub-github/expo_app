import { getSql } from "../client";

export type GeoHierarchyLevel =
  | "state"
  | "region"
  | "district"
  | "division"
  | "post_office"
  | "pincode";

export type RiderGeoIdentityMethodsRow = {
  id: number;
  geoLevel: GeoHierarchyLevel;
  geoRefId: string;
  digilockerEnabled: boolean;
  aadhaarMaskingEnabled: boolean;
  manualUploadEnabled: boolean;
  priority: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  geo_level: string;
  geo_ref_id: string;
  digilocker_enabled: boolean;
  aadhaar_masking_enabled: boolean;
  manual_upload_enabled: boolean;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(r: DbRow): RiderGeoIdentityMethodsRow {
  return {
    id: Number(r.id),
    geoLevel: r.geo_level as GeoHierarchyLevel,
    geoRefId: String(r.geo_ref_id),
    digilockerEnabled: r.digilocker_enabled !== false,
    aadhaarMaskingEnabled: r.aadhaar_masking_enabled !== false,
    manualUploadEnabled: r.manual_upload_enabled !== false,
    priority: Number(r.priority ?? 100),
    isActive: r.is_active !== false,
    notes: r.notes,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function listRiderGeoIdentityMethods(args: {
  level: GeoHierarchyLevel;
  refId: string;
}): Promise<RiderGeoIdentityMethodsRow[]> {
  const sql = getSql();
  const rows = await sql<DbRow[]>`
    SELECT *
    FROM rider_geo_identity_methods
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC
  `;
  return rows.map(mapRow);
}

export async function upsertRiderGeoIdentityMethods(args: {
  level: GeoHierarchyLevel;
  refId: string;
  digilockerEnabled?: boolean;
  aadhaarMaskingEnabled?: boolean;
  manualUploadEnabled?: boolean;
  priority?: number;
  isActive?: boolean;
  notes?: string | null;
}): Promise<RiderGeoIdentityMethodsRow> {
  const sql = getSql();
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM rider_geo_identity_methods
    WHERE geo_level = ${args.level}::geo_pricing_level
      AND geo_ref_id = ${args.refId}::uuid
      AND deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql<DbRow[]>`
      UPDATE rider_geo_identity_methods SET
        digilocker_enabled = ${args.digilockerEnabled ?? true},
        aadhaar_masking_enabled = ${args.aadhaarMaskingEnabled ?? true},
        manual_upload_enabled = ${args.manualUploadEnabled ?? true},
        priority = ${args.priority ?? 100},
        is_active = ${args.isActive ?? true},
        notes = ${args.notes ?? null},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING *
    `;
    return mapRow(rows[0]!);
  }

  const rows = await sql<DbRow[]>`
    INSERT INTO rider_geo_identity_methods (
      geo_level, geo_ref_id,
      digilocker_enabled, aadhaar_masking_enabled, manual_upload_enabled,
      priority, is_active, notes
    ) VALUES (
      ${args.level}::geo_pricing_level, ${args.refId}::uuid,
      ${args.digilockerEnabled ?? true},
      ${args.aadhaarMaskingEnabled ?? true},
      ${args.manualUploadEnabled ?? true},
      ${args.priority ?? 100},
      ${args.isActive ?? true},
      ${args.notes ?? null}
    )
    RETURNING *
  `;
  return mapRow(rows[0]!);
}

export async function softDeleteRiderGeoIdentityMethods(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    UPDATE rider_geo_identity_methods
    SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}
