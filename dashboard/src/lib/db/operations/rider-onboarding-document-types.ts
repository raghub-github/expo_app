import { eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { riderOnboardingDocumentTypes } from "@/lib/db/schema";

export type RiderOnboardingDocumentTypeRow = {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  icon: string | null;
  captureGroup: "dl_rc" | "rental_ev";
  requiresTextField: boolean;
  textFieldLabel: string | null;
  textFieldPlaceholder: string | null;
  minTextLength: number;
  sortOrder: number;
  isActive: boolean;
};

function mapRow(row: {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  icon: string | null;
  captureGroup: string;
  requiresTextField: boolean;
  textFieldLabel: string | null;
  textFieldPlaceholder: string | null;
  minTextLength: number;
  sortOrder: number;
  isActive: boolean;
}): RiderOnboardingDocumentTypeRow {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    hint: row.hint,
    icon: row.icon,
    captureGroup: row.captureGroup as RiderOnboardingDocumentTypeRow["captureGroup"],
    requiresTextField: row.requiresTextField,
    textFieldLabel: row.textFieldLabel,
    textFieldPlaceholder: row.textFieldPlaceholder,
    minTextLength: row.minTextLength,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function listRiderOnboardingDocumentTypes(args?: {
  activeOnly?: boolean;
  captureGroup?: "dl_rc" | "rental_ev";
}): Promise<RiderOnboardingDocumentTypeRow[]> {
  const activeOnly = args?.activeOnly === true;
  const captureGroup = args?.captureGroup;
  const sql = getSql();

  const rows = captureGroup
    ? activeOnly
      ? await sql<RiderOnboardingDocumentTypeRow[]>`
          SELECT
            id, code, label, hint, icon,
            capture_group AS "captureGroup",
            requires_text_field AS "requiresTextField",
            text_field_label AS "textFieldLabel",
            text_field_placeholder AS "textFieldPlaceholder",
            min_text_length AS "minTextLength",
            sort_order AS "sortOrder",
            is_active AS "isActive"
          FROM rider_onboarding_document_types
          WHERE is_active = true AND capture_group = ${captureGroup}
          ORDER BY sort_order ASC, id ASC
        `
      : await sql<RiderOnboardingDocumentTypeRow[]>`
          SELECT
            id, code, label, hint, icon,
            capture_group AS "captureGroup",
            requires_text_field AS "requiresTextField",
            text_field_label AS "textFieldLabel",
            text_field_placeholder AS "textFieldPlaceholder",
            min_text_length AS "minTextLength",
            sort_order AS "sortOrder",
            is_active AS "isActive"
          FROM rider_onboarding_document_types
          WHERE capture_group = ${captureGroup}
          ORDER BY sort_order ASC, id ASC
        `
    : activeOnly
      ? await sql<RiderOnboardingDocumentTypeRow[]>`
          SELECT
            id, code, label, hint, icon,
            capture_group AS "captureGroup",
            requires_text_field AS "requiresTextField",
            text_field_label AS "textFieldLabel",
            text_field_placeholder AS "textFieldPlaceholder",
            min_text_length AS "minTextLength",
            sort_order AS "sortOrder",
            is_active AS "isActive"
          FROM rider_onboarding_document_types
          WHERE is_active = true
          ORDER BY capture_group ASC, sort_order ASC, id ASC
        `
      : await sql<RiderOnboardingDocumentTypeRow[]>`
          SELECT
            id, code, label, hint, icon,
            capture_group AS "captureGroup",
            requires_text_field AS "requiresTextField",
            text_field_label AS "textFieldLabel",
            text_field_placeholder AS "textFieldPlaceholder",
            min_text_length AS "minTextLength",
            sort_order AS "sortOrder",
            is_active AS "isActive"
          FROM rider_onboarding_document_types
          ORDER BY capture_group ASC, sort_order ASC, id ASC
        `;

  return rows.map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
}

export async function insertRiderOnboardingDocumentType(input: {
  code: string;
  label: string;
  hint?: string | null;
  icon?: string | null;
  captureGroup: "dl_rc" | "rental_ev";
  requiresTextField?: boolean;
  textFieldLabel?: string | null;
  textFieldPlaceholder?: string | null;
  minTextLength?: number;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<RiderOnboardingDocumentTypeRow> {
  const db = getDb();
  const [row] = await db
    .insert(riderOnboardingDocumentTypes)
    .values({
      code: input.code.trim(),
      label: input.label.trim(),
      hint: input.hint?.trim() || null,
      icon: input.icon?.trim() || null,
      captureGroup: input.captureGroup,
      requiresTextField: input.requiresTextField ?? false,
      textFieldLabel: input.textFieldLabel?.trim() || null,
      textFieldPlaceholder: input.textFieldPlaceholder?.trim() || null,
      minTextLength: input.minTextLength ?? 4,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("Insert failed");
  return mapRow(row as Parameters<typeof mapRow>[0]);
}

export async function updateRiderOnboardingDocumentType(
  id: number,
  patch: Partial<{
    code: string;
    label: string;
    hint: string | null;
    icon: string | null;
    captureGroup: "dl_rc" | "rental_ev";
    requiresTextField: boolean;
    textFieldLabel: string | null;
    textFieldPlaceholder: string | null;
    minTextLength: number;
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<RiderOnboardingDocumentTypeRow | null> {
  const db = getDb();
  const [row] = await db
    .update(riderOnboardingDocumentTypes)
    .set({
      ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.hint !== undefined ? { hint: patch.hint?.trim() || null } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon?.trim() || null } : {}),
      ...(patch.captureGroup !== undefined ? { captureGroup: patch.captureGroup } : {}),
      ...(patch.requiresTextField !== undefined
        ? { requiresTextField: patch.requiresTextField }
        : {}),
      ...(patch.textFieldLabel !== undefined
        ? { textFieldLabel: patch.textFieldLabel?.trim() || null }
        : {}),
      ...(patch.textFieldPlaceholder !== undefined
        ? { textFieldPlaceholder: patch.textFieldPlaceholder?.trim() || null }
        : {}),
      ...(patch.minTextLength !== undefined ? { minTextLength: patch.minTextLength } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(riderOnboardingDocumentTypes.id, id))
    .returning();
  return row ? mapRow(row as Parameters<typeof mapRow>[0]) : null;
}

export async function deactivateRiderOnboardingDocumentType(
  id: number
): Promise<RiderOnboardingDocumentTypeRow | null> {
  return updateRiderOnboardingDocumentType(id, { isActive: false });
}
