import { getSql } from "../client";
import { defaultCuisineListEnabled } from "@/lib/onboarding-store-types";
import {
  coerceFormSection,
  type MerchantDocRequirement,
} from "@/lib/merchant-onboarding-docs";

export type MerchantOnboardingDocumentTypeRow = {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  formSection: "PAN" | "AADHAAR" | "LICENCE" | "GST" | "BANK";
  sortOrder: number;
  isActive: boolean;
};

export type MerchantStoreTypeDocumentMapRow = {
  id: number;
  storeType: string;
  documentCode: string;
  isMandatory: boolean;
  isActive: boolean;
  displayOrder: number;
};

function normalizeStoreType(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "_");
}

function normalizeCode(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "_");
}

export async function listPlatformStoreTypes(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ storeType: string }[]>`
    SELECT DISTINCT store_type AS "storeType"
    FROM platform_food_acceptance_settings_by_store_type
    WHERE store_type IS NOT NULL AND btrim(store_type) <> ''
    ORDER BY store_type ASC
  `;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const t = normalizeStoreType(r.storeType);
    if (!t || t === "RIDER" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export async function listAcceptanceStoreTypes(): Promise<string[]> {
  // Order acceptance settings is the source of truth for onboarding + RX/MX Merchant docs.
  return listPlatformStoreTypes();
}

export async function listMerchantOnboardingDocumentTypes(args?: {
  activeOnly?: boolean;
}): Promise<MerchantOnboardingDocumentTypeRow[]> {
  const sql = getSql();
  const activeOnly = args?.activeOnly === true;
  const rows = activeOnly
    ? await sql<MerchantOnboardingDocumentTypeRow[]>`
        SELECT
          id, code, label, hint,
          form_section AS "formSection",
          sort_order AS "sortOrder",
          is_active AS "isActive"
        FROM merchant_onboarding_document_types
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
      `
    : await sql<MerchantOnboardingDocumentTypeRow[]>`
        SELECT
          id, code, label, hint,
          form_section AS "formSection",
          sort_order AS "sortOrder",
          is_active AS "isActive"
        FROM merchant_onboarding_document_types
        ORDER BY sort_order ASC, id ASC
      `;
  return rows;
}

export async function listMerchantStoreTypeDocumentMap(args?: {
  storeType?: string;
  activeOnly?: boolean;
}): Promise<MerchantStoreTypeDocumentMapRow[]> {
  const sql = getSql();
  const storeType = args?.storeType ? normalizeStoreType(args.storeType) : null;
  const activeOnly = args?.activeOnly === true;
  if (storeType && activeOnly) {
    return sql<MerchantStoreTypeDocumentMapRow[]>`
      SELECT
        id,
        store_type AS "storeType",
        document_code AS "documentCode",
        is_mandatory AS "isMandatory",
        is_active AS "isActive",
        display_order AS "displayOrder"
      FROM merchant_store_type_document_map
      WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${storeType} AND is_active = true
      ORDER BY display_order ASC, id ASC
    `;
  }
  if (storeType) {
    return sql<MerchantStoreTypeDocumentMapRow[]>`
      SELECT
        id,
        store_type AS "storeType",
        document_code AS "documentCode",
        is_mandatory AS "isMandatory",
        is_active AS "isActive",
        display_order AS "displayOrder"
      FROM merchant_store_type_document_map
      WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${storeType}
      ORDER BY display_order ASC, id ASC
    `;
  }
  if (activeOnly) {
    return sql<MerchantStoreTypeDocumentMapRow[]>`
      SELECT
        id,
        store_type AS "storeType",
        document_code AS "documentCode",
        is_mandatory AS "isMandatory",
        is_active AS "isActive",
        display_order AS "displayOrder"
      FROM merchant_store_type_document_map
      WHERE is_active = true
      ORDER BY store_type ASC, display_order ASC, id ASC
    `;
  }
  return sql<MerchantStoreTypeDocumentMapRow[]>`
    SELECT
      id,
      store_type AS "storeType",
      document_code AS "documentCode",
      is_mandatory AS "isMandatory",
      is_active AS "isActive",
      display_order AS "displayOrder"
    FROM merchant_store_type_document_map
    ORDER BY store_type ASC, display_order ASC, id ASC
  `;
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "t" || s === "true" || s === "yes" || s === "1";
}

function normalizeMappedDocs(
  rows: {
    code: string;
    label: string;
    hint: string | null;
    formSection: string | null;
    isMandatory: unknown;
    displayOrder: number;
  }[]
): MerchantDocRequirement[] {
  const seen = new Set<string>();
  const out: MerchantDocRequirement[] = [];
  for (const row of rows) {
    const code = String(row.code || "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      label: String(row.label || code).trim() || code,
      hint: row.hint ?? null,
      formSection: coerceFormSection(row.formSection, code),
      isMandatory: asBool(row.isMandatory),
      displayOrder: Number(row.displayOrder) || 0,
    });
  }
  return out;
}

export async function listActiveRequirementsForStoreType(storeType: string) {
  const sql = getSql();
  const t = normalizeStoreType(storeType);
  // Super Admin map is the source of truth. Catalog is labels/section only —
  // do not hide a mapped doc just because catalog.is_active is false.
  const [allMapRows, catalog] = await Promise.all([
    listMerchantStoreTypeDocumentMap({ storeType: t, activeOnly: false }),
    listMerchantOnboardingDocumentTypes(),
  ]);
  const catalogByCode = new Map(catalog.map((c) => [normalizeCode(c.code), c]));
  const mapRows = allMapRows.filter((r) => asBool(r.isActive));
  const mapped = normalizeMappedDocs(
    mapRows.map((r) => {
      const code = normalizeCode(r.documentCode);
      const cat = catalogByCode.get(code);
      return {
        code,
        label: cat?.label ?? r.documentCode,
        hint: cat?.hint ?? null,
        formSection: cat?.formSection ?? null,
        isMandatory: r.isMandatory,
        displayOrder: r.displayOrder,
      };
    })
  );
  // This store type is already in Super Admin's map (even if every row is inactive).
  // Do not fall back to the legacy table — that re-injects FSSAI / Shop Act / Drug Lic.
  if (allMapRows.length > 0) return mapped;

  // Catalog map empty (migration not copied) — use legacy per-type requirements.
  try {
    const legacy = await sql<
      {
        code: string;
        label: string;
        hint: string | null;
        formSection: string | null;
        isMandatory: boolean;
        displayOrder: number;
      }[]
    >`
      SELECT
        UPPER(BTRIM(d.document_type::text)) AS code,
        COALESCE(NULLIF(BTRIM(MAX(d.display_name)), ''), UPPER(BTRIM(d.document_type::text))) AS label,
        MAX(d.description) AS hint,
        NULL AS "formSection",
        bool_or(d.is_mandatory) AS "isMandatory",
        COALESCE(MIN(d.display_order), 0) AS "displayOrder"
      FROM store_type_document_requirements d
      WHERE UPPER(REPLACE(REPLACE(BTRIM(d.store_type::text), ' ', '_'), '-', '_')) = ${t}
         OR UPPER(BTRIM(d.store_type::text)) = ${t}
      GROUP BY UPPER(BTRIM(d.document_type::text))
      ORDER BY COALESCE(MIN(d.display_order), 0) ASC
    `;
    return normalizeMappedDocs(legacy);
  } catch {
    return mapped;
  }
}

export async function insertMerchantOnboardingDocumentType(input: {
  code: string;
  label: string;
  hint?: string | null;
  formSection: "PAN" | "AADHAAR" | "LICENCE" | "GST" | "BANK";
  sortOrder?: number;
  isActive?: boolean;
}): Promise<MerchantOnboardingDocumentTypeRow> {
  const sql = getSql();
  const rows = await sql<MerchantOnboardingDocumentTypeRow[]>`
    INSERT INTO merchant_onboarding_document_types (
      code, label, hint, form_section, sort_order, is_active, updated_at
    )
    VALUES (
      ${normalizeCode(input.code)},
      ${input.label.trim()},
      ${input.hint?.trim() || null},
      ${input.formSection},
      ${input.sortOrder ?? 0},
      ${input.isActive ?? true},
      NOW()
    )
    RETURNING
      id, code, label, hint,
      form_section AS "formSection",
      sort_order AS "sortOrder",
      is_active AS "isActive"
  `;
  const row = rows[0];
  if (!row) throw new Error("Insert failed");
  return row;
}

export async function updateMerchantOnboardingDocumentType(
  id: number,
  patch: Partial<{
    code: string;
    label: string;
    hint: string | null;
    formSection: "PAN" | "AADHAAR" | "LICENCE" | "GST" | "BANK";
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<MerchantOnboardingDocumentTypeRow | null> {
  const sql = getSql();
  const code = patch.code !== undefined ? normalizeCode(patch.code) : null;
  const label = patch.label !== undefined ? patch.label.trim() : null;
  const hint = patch.hint !== undefined ? patch.hint?.trim() || null : undefined;
  const formSection = patch.formSection ?? null;
  const sortOrder = patch.sortOrder ?? null;
  const isActive = patch.isActive ?? null;

  const rows = await sql<MerchantOnboardingDocumentTypeRow[]>`
    UPDATE merchant_onboarding_document_types
    SET
      code = COALESCE(${code}, code),
      label = COALESCE(${label}, label),
      hint = CASE WHEN ${hint !== undefined} THEN ${hint ?? null} ELSE hint END,
      form_section = COALESCE(${formSection}, form_section),
      sort_order = COALESCE(${sortOrder}, sort_order),
      is_active = COALESCE(${isActive}, is_active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id, code, label, hint,
      form_section AS "formSection",
      sort_order AS "sortOrder",
      is_active AS "isActive"
  `;
  return rows[0] ?? null;
}

export async function deactivateMerchantOnboardingDocumentType(id: number) {
  return updateMerchantOnboardingDocumentType(id, { isActive: false });
}

export async function upsertStoreTypeDocumentRequirement(input: {
  storeType: string;
  documentCode: string;
  isMandatory?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}): Promise<MerchantStoreTypeDocumentMapRow> {
  const sql = getSql();
  const storeType = normalizeStoreType(input.storeType);
  const documentCode = normalizeCode(input.documentCode);
  const rows = await sql<MerchantStoreTypeDocumentMapRow[]>`
    INSERT INTO merchant_store_type_document_map (
      store_type, document_code, is_mandatory, is_active, display_order, updated_at
    )
    VALUES (
      ${storeType},
      ${documentCode},
      ${input.isMandatory ?? false},
      ${input.isActive ?? true},
      ${input.displayOrder ?? 0},
      NOW()
    )
    ON CONFLICT (store_type, document_code) DO UPDATE SET
      is_mandatory = EXCLUDED.is_mandatory,
      is_active = EXCLUDED.is_active,
      display_order = EXCLUDED.display_order,
      updated_at = NOW()
    RETURNING
      id,
      store_type AS "storeType",
      document_code AS "documentCode",
      is_mandatory AS "isMandatory",
      is_active AS "isActive",
      display_order AS "displayOrder"
  `;
  const row = rows[0];
  if (!row) throw new Error("Upsert failed");
  return row;
}

export async function deleteMerchantStoreTypeDocumentMaps(storeType: string): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    DELETE FROM merchant_store_type_document_map
    WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${normalizeStoreType(storeType)}
    RETURNING id
  `;
  return rows.length;
}

export async function deleteStoreTypeDocumentRequirement(
  storeType: string,
  documentCode: string
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    DELETE FROM merchant_store_type_document_map
    WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${normalizeStoreType(storeType)}
      AND UPPER(BTRIM(document_code)) = ${normalizeCode(documentCode)}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listCuisineListFlags(): Promise<Record<string, boolean>> {
  const sql = getSql();
  try {
    const rows = await sql<{ storeType: string; cuisineListEnabled: boolean }[]>`
      SELECT store_type AS "storeType", cuisine_list_enabled AS "cuisineListEnabled"
      FROM merchant_store_type_onboarding_flags
    `;
    const out: Record<string, boolean> = {};
    for (const r of rows) {
      const t = normalizeStoreType(r.storeType);
      if (t) out[t] = r.cuisineListEnabled === true;
    }
    return out;
  } catch {
    return {};
  }
}

export async function getCuisineListEnabled(storeType: string): Promise<boolean> {
  const t = normalizeStoreType(storeType);
  try {
    const sql = getSql();
    const rows = await sql<{ cuisineListEnabled: boolean }[]>`
      SELECT cuisine_list_enabled AS "cuisineListEnabled"
      FROM merchant_store_type_onboarding_flags
      WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${t}
      LIMIT 1
    `;
    if (rows[0]) return rows[0].cuisineListEnabled === true;
  } catch {
    /* table may not exist yet */
  }
  return defaultCuisineListEnabled(t);
}

export async function setCuisineListEnabled(
  storeType: string,
  enabled: boolean
): Promise<{ storeType: string; cuisineListEnabled: boolean }> {
  const sql = getSql();
  const t = normalizeStoreType(storeType);
  const rows = await sql<{ storeType: string; cuisineListEnabled: boolean }[]>`
    INSERT INTO merchant_store_type_onboarding_flags (store_type, cuisine_list_enabled, updated_at)
    VALUES (${t}, ${enabled}, NOW())
    ON CONFLICT (store_type) DO UPDATE SET
      cuisine_list_enabled = EXCLUDED.cuisine_list_enabled,
      updated_at = NOW()
    RETURNING store_type AS "storeType", cuisine_list_enabled AS "cuisineListEnabled"
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to save cuisine flag");
  return row;
}
