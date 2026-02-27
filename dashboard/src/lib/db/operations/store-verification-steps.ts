/**
 * Step-by-step store verification (7 onboarding steps; step 6 Preview and step 7 Agreement removed).
 * Table: store_verification_steps (store_id, step_number, verified_at, verified_by, verified_by_name).
 * Table: store_verification_step_edits (per-field edit log: who changed what, when).
 */

import { getSql } from "../client";

export interface VerificationStepRecord {
  step_number: number;
  verified_at: string;
  verified_by: number | null;
  verified_by_name: string | null;
  notes: string | null;
}

export interface VerificationStepEditRecord {
  step_number: number;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: number | null;
  edited_by_name: string | null;
  edited_at: string;
}

/**
 * Get verification step records for a store (steps 1–7). Returns only rows that exist (verified steps).
 */
export async function getStoreVerificationSteps(
  storeId: number
): Promise<VerificationStepRecord[]> {
  const sql = getSql();
  try {
    const rows = await sql<VerificationStepRecord[]>`
      SELECT step_number, verified_at::text, verified_by, verified_by_name, notes
      FROM store_verification_steps
      WHERE store_id = ${storeId}
      ORDER BY step_number ASC
    `;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Insert a single field-edit record for store verification (who edited which field, when).
 */
export async function insertStoreVerificationStepEdit(params: {
  storeId: number;
  stepNumber: number;
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
  editedBy: number | null;
  editedByName: string | null;
}): Promise<boolean> {
  if (params.stepNumber < 1 || params.stepNumber > 7) return false;
  const sql = getSql();
  try {
    await sql`
      INSERT INTO store_verification_step_edits (store_id, step_number, field_key, old_value, new_value, edited_by, edited_by_name)
      VALUES (${params.storeId}, ${params.stepNumber}, ${params.fieldKey}, ${params.oldValue}, ${params.newValue}, ${params.editedBy}, ${params.editedByName ?? ""})
    `;
    return true;
  } catch (e) {
    console.error("[insertStoreVerificationStepEdit]", e);
    return false;
  }
}

/**
 * Get all field-edit records for a store (for audit / display who changed what per step).
 */
export async function getStoreVerificationStepEdits(
  storeId: number
): Promise<VerificationStepEditRecord[]> {
  const sql = getSql();
  try {
    const rows = await sql<VerificationStepEditRecord[]>`
      SELECT step_number, field_key, old_value, new_value, edited_by, edited_by_name, edited_at::text
      FROM store_verification_step_edits
      WHERE store_id = ${storeId}
      ORDER BY step_number ASC, edited_at DESC
    `;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Mark a step as verified. Upserts by (store_id, step_number).
 */
export async function upsertStoreVerificationStep(params: {
  storeId: number;
  stepNumber: number;
  verifiedBy: number | null;
  verifiedByName: string | null;
  notes?: string | null;
}): Promise<boolean> {
  if (params.stepNumber < 1 || params.stepNumber > 7) return false;
  const verifiedByName = params.verifiedByName ?? "";
  const sql = getSql();
  try {
    await sql`
      INSERT INTO store_verification_steps (store_id, step_number, verified_by, verified_by_name, notes)
      VALUES (${params.storeId}, ${params.stepNumber}, ${params.verifiedBy}, ${verifiedByName}, ${params.notes ?? null})
      ON CONFLICT (store_id, step_number)
      DO UPDATE SET
        verified_at = now(),
        verified_by = EXCLUDED.verified_by,
        verified_by_name = EXCLUDED.verified_by_name,
        notes = EXCLUDED.notes
    `;
    return true;
  } catch (e) {
    console.error("[upsertStoreVerificationStep]", e);
    return false;
  }
}

/**
 * Set a step back to pending (un-verify) by deleting its verification record.
 */
export async function deleteStoreVerificationStep(
  storeId: number,
  stepNumber: number
): Promise<boolean> {
  if (stepNumber < 1 || stepNumber > 7) return false;
  const sql = getSql();
  try {
    await sql`
      DELETE FROM store_verification_steps
      WHERE store_id = ${storeId} AND step_number = ${stepNumber}
    `;
    return true;
  } catch (e) {
    console.error("[deleteStoreVerificationStep]", e);
    return false;
  }
}
