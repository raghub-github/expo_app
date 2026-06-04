import { eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { riderOnboardingVehicleTypes } from "@/lib/db/schema";

export type OnboardingVehicleDocRequirements = {
  required_docs?: string[];
  has_own_vehicle?: boolean;
  requires_max_speed?: boolean;
};

export type RiderOnboardingVehicleTypeRow = {
  id: number;
  code: string;
  categoryCode: string | null;
  label: string;
  hint: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
  documentRequirements: OnboardingVehicleDocRequirements;
  infoMessage: string | null;
  mapsToVehicleType: string | null;
};

function mapRow(row: {
  id: number;
  code: string;
  categoryCode?: string | null;
  label: string;
  hint: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: string;
  documentRequirements: unknown;
  infoMessage: string | null;
  mapsToVehicleType: string | null;
}): RiderOnboardingVehicleTypeRow {
  const docs =
    row.documentRequirements && typeof row.documentRequirements === "object"
      ? (row.documentRequirements as OnboardingVehicleDocRequirements)
      : {};
  return {
    id: row.id,
    code: row.code,
    categoryCode: row.categoryCode ?? null,
    label: row.label,
    hint: row.hint,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    onboardingFlow: row.onboardingFlow as RiderOnboardingVehicleTypeRow["onboardingFlow"],
    documentRequirements: docs,
    infoMessage: row.infoMessage,
    mapsToVehicleType: row.mapsToVehicleType,
  };
}

export async function listRiderOnboardingVehicleTypes(args?: {
  activeOnly?: boolean;
}): Promise<RiderOnboardingVehicleTypeRow[]> {
  const activeOnly = args?.activeOnly === true;
  const sql = getSql();
  const rows = activeOnly
    ? await sql<RiderOnboardingVehicleTypeRow[]>`
        SELECT
          id,
          code,
          category_code AS "categoryCode",
          label,
          hint,
          icon,
          sort_order AS "sortOrder",
          is_active AS "isActive",
          onboarding_flow AS "onboardingFlow",
          document_requirements AS "documentRequirements",
          info_message AS "infoMessage",
          maps_to_vehicle_type AS "mapsToVehicleType"
        FROM rider_onboarding_vehicle_types
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
      `
    : await sql<RiderOnboardingVehicleTypeRow[]>`
        SELECT
          id,
          code,
          category_code AS "categoryCode",
          label,
          hint,
          icon,
          sort_order AS "sortOrder",
          is_active AS "isActive",
          onboarding_flow AS "onboardingFlow",
          document_requirements AS "documentRequirements",
          info_message AS "infoMessage",
          maps_to_vehicle_type AS "mapsToVehicleType"
        FROM rider_onboarding_vehicle_types
        ORDER BY sort_order ASC, id ASC
      `;
  return rows.map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
}

export async function insertRiderOnboardingVehicleType(input: {
  code: string;
  categoryCode?: string | null;
  label: string;
  hint?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
  documentRequirements?: OnboardingVehicleDocRequirements;
  infoMessage?: string | null;
  mapsToVehicleType?: string | null;
}): Promise<RiderOnboardingVehicleTypeRow> {
  const db = getDb();
  const [row] = await db
    .insert(riderOnboardingVehicleTypes)
    .values({
      code: input.code.trim(),
      categoryCode: input.categoryCode?.trim() || null,
      label: input.label.trim(),
      hint: input.hint?.trim() || null,
      icon: input.icon?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      onboardingFlow: input.onboardingFlow,
      documentRequirements: input.documentRequirements ?? {},
      infoMessage: input.infoMessage?.trim() || null,
      mapsToVehicleType: input.mapsToVehicleType?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Insert failed");
  return mapRow(row as Parameters<typeof mapRow>[0]);
}

export async function updateRiderOnboardingVehicleType(
  id: number,
  patch: Partial<{
    code: string;
    categoryCode: string | null;
    label: string;
    hint: string | null;
    icon: string | null;
    sortOrder: number;
    isActive: boolean;
    onboardingFlow: "dl_rc" | "rental_ev" | "payment";
    documentRequirements: OnboardingVehicleDocRequirements;
    infoMessage: string | null;
    mapsToVehicleType: string | null;
  }>
): Promise<RiderOnboardingVehicleTypeRow | null> {
  const db = getDb();
  const [row] = await db
    .update(riderOnboardingVehicleTypes)
    .set({
      ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
      ...(patch.categoryCode !== undefined
        ? { categoryCode: patch.categoryCode?.trim() || null }
        : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.hint !== undefined ? { hint: patch.hint?.trim() || null } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon?.trim() || null } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.onboardingFlow !== undefined ? { onboardingFlow: patch.onboardingFlow } : {}),
      ...(patch.documentRequirements !== undefined
        ? { documentRequirements: patch.documentRequirements }
        : {}),
      ...(patch.infoMessage !== undefined ? { infoMessage: patch.infoMessage?.trim() || null } : {}),
      ...(patch.mapsToVehicleType !== undefined
        ? { mapsToVehicleType: patch.mapsToVehicleType?.trim() || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(riderOnboardingVehicleTypes.id, id))
    .returning();
  return row ? mapRow(row as Parameters<typeof mapRow>[0]) : null;
}

export async function deactivateRiderOnboardingVehicleType(
  id: number
): Promise<RiderOnboardingVehicleTypeRow | null> {
  return updateRiderOnboardingVehicleType(id, { isActive: false });
}
