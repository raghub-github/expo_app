import { eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { riderOnboardingVehicleCategories } from "@/lib/db/schema";

export type RiderOnboardingVehicleCategoryRow = {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  icon: string | null;
  wheelCount: number;
  sortOrder: number;
  isActive: boolean;
};

export async function listRiderOnboardingVehicleCategories(args?: {
  activeOnly?: boolean;
}): Promise<RiderOnboardingVehicleCategoryRow[]> {
  const activeOnly = args?.activeOnly === true;
  const sql = getSql();
  const rows = activeOnly
    ? await sql<RiderOnboardingVehicleCategoryRow[]>`
        SELECT
          id, code, label, hint, icon,
          wheel_count AS "wheelCount",
          sort_order AS "sortOrder",
          is_active AS "isActive"
        FROM rider_onboarding_vehicle_categories
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
      `
    : await sql<RiderOnboardingVehicleCategoryRow[]>`
        SELECT
          id, code, label, hint, icon,
          wheel_count AS "wheelCount",
          sort_order AS "sortOrder",
          is_active AS "isActive"
        FROM rider_onboarding_vehicle_categories
        ORDER BY sort_order ASC, id ASC
      `;
  return rows;
}

export async function insertRiderOnboardingVehicleCategory(input: {
  code: string;
  label: string;
  hint?: string | null;
  icon?: string | null;
  wheelCount: number;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<RiderOnboardingVehicleCategoryRow> {
  const db = getDb();
  const [row] = await db
    .insert(riderOnboardingVehicleCategories)
    .values({
      code: input.code.trim(),
      label: input.label.trim(),
      hint: input.hint?.trim() || null,
      icon: input.icon?.trim() || null,
      wheelCount: input.wheelCount,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Insert failed");
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    hint: row.hint,
    icon: row.icon,
    wheelCount: row.wheelCount,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function updateRiderOnboardingVehicleCategory(
  id: number,
  patch: Partial<{
    code: string;
    label: string;
    hint: string | null;
    icon: string | null;
    wheelCount: number;
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<RiderOnboardingVehicleCategoryRow | null> {
  const db = getDb();
  const [row] = await db
    .update(riderOnboardingVehicleCategories)
    .set({
      ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.hint !== undefined ? { hint: patch.hint?.trim() || null } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon?.trim() || null } : {}),
      ...(patch.wheelCount !== undefined ? { wheelCount: patch.wheelCount } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(riderOnboardingVehicleCategories.id, id))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    hint: row.hint,
    icon: row.icon,
    wheelCount: row.wheelCount,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function deactivateRiderOnboardingVehicleCategory(id: number) {
  return updateRiderOnboardingVehicleCategory(id, { isActive: false });
}
