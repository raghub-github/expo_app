/**
 * Step-by-step store verification (8 onboarding steps: 6 = bank account, 7 = commission, 8 = sign & submit).
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

export type StepRejectionRecord = {
  rejected_at: string;
  rejection_reason: string;
  step_label: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  email_sent: boolean;
  email_skip_reason: string | null;
  merchant_resubmitted_at: string | null;
  /** JSON snapshot (e.g. step 3 menu image/PDF/sheet statuses). */
  rejection_detail: unknown | null;
};

/** Row returned by GET/POST/DELETE verification-steps API (includes last step rejection if any). */
export type VerificationStepApiRow = {
  verified_at: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  notes: string | null;
  rejection: StepRejectionRecord | null;
};

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
 * Get verification step records for a store (steps 1–8). Returns only rows that exist (verified steps).
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
 * Latest agent rejection per step (for UI "Rejected" tag after step is un-verified).
 */
export async function getStoreVerificationStepRejections(
  storeId: number
): Promise<Record<number, StepRejectionRecord>> {
  const sql = getSql();
  try {
    const rows = await sql<
      {
        step_number: number;
        rejected_at: string;
        rejection_reason: string;
        step_label: string | null;
        rejected_by: number | null;
        rejected_by_name: string | null;
        email_sent: boolean;
        email_skip_reason: string | null;
        merchant_resubmitted_at: string | null;
        step_rejection_detail: unknown | null;
      }[]
    >`
      SELECT
        step_number,
        rejected_at::text,
        rejection_reason,
        step_label,
        rejected_by,
        rejected_by_name,
        COALESCE(email_sent, false) AS email_sent,
        email_skip_reason,
        merchant_resubmitted_at::text,
        step_rejection_detail
      FROM store_verification_step_rejections
      WHERE store_id = ${storeId}
    `;
    const out: Record<number, StepRejectionRecord> = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      out[r.step_number] = {
        rejected_at: r.rejected_at,
        rejection_reason: r.rejection_reason,
        step_label: r.step_label ?? null,
        rejected_by: r.rejected_by ?? null,
        rejected_by_name: r.rejected_by_name ?? null,
        email_sent: !!r.email_sent,
        email_skip_reason: r.email_skip_reason ?? null,
        merchant_resubmitted_at: r.merchant_resubmitted_at ?? null,
        rejection_detail: r.step_rejection_detail ?? null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeVerificationStepsWithRejections(
  steps: VerificationStepRecord[],
  rejections: Record<number, StepRejectionRecord>
): Record<number, VerificationStepApiRow> {
  const byStep: Record<number, VerificationStepApiRow> = {};
  for (let i = 1; i <= 7; i++) {
    const s = steps.find((x) => x.step_number === i);
    const rej = rejections[i] ?? null;
    byStep[i] = s
      ? {
          verified_at: s.verified_at,
          verified_by: s.verified_by,
          verified_by_name: s.verified_by_name,
          notes: s.notes,
          rejection: rej,
        }
      : {
          verified_at: null,
          verified_by: null,
          verified_by_name: null,
          notes: null,
          rejection: rej,
        };
  }
  return byStep;
}

export async function getStoreVerificationStepsApiRows(
  storeId: number
): Promise<Record<number, VerificationStepApiRow>> {
  const [steps, rejections] = await Promise.all([
    getStoreVerificationSteps(storeId),
    getStoreVerificationStepRejections(storeId),
  ]);
  return mergeVerificationStepsWithRejections(steps, rejections);
}

async function insertStoreVerificationStepRejectionHistory(params: {
  storeId: number;
  stepNumber: number;
  stepLabel: string | null;
  reason: string;
  rejectedBy: number | null;
  rejectedByName: string | null;
  emailSent: boolean;
  emailSkipReason: string | null;
  stepRejectionDetail: unknown | null;
}): Promise<void> {
  const sql = getSql();
  const detailJson =
    params.stepRejectionDetail != null ? JSON.stringify(params.stepRejectionDetail) : null;
  try {
    await sql`
      INSERT INTO store_verification_step_rejection_history (
        store_id,
        step_number,
        step_label,
        rejection_reason,
        rejected_by,
        rejected_by_name,
        email_sent,
        email_skip_reason,
        step_rejection_detail
      ) VALUES (
        ${params.storeId},
        ${params.stepNumber},
        ${params.stepLabel},
        ${params.reason},
        ${params.rejectedBy},
        ${params.rejectedByName},
        ${params.emailSent},
        ${params.emailSkipReason},
        ${detailJson}::jsonb
      )
    `;
  } catch (e) {
    console.warn("[insertStoreVerificationStepRejectionHistory]", e);
  }
}

export async function upsertStoreVerificationStepRejection(params: {
  storeId: number;
  stepNumber: number;
  reason: string;
  stepLabel: string;
  rejectedBy: number | null;
  rejectedByName: string | null;
  emailSent: boolean;
  emailSkipReason: string | null;
  /** e.g. MENU_REFERENCE snapshot for step 3 */
  stepRejectionDetail?: unknown | null;
}): Promise<boolean> {
  if (params.stepNumber < 1 || params.stepNumber > 8) return false;
  const sql = getSql();
  const detailJson =
    params.stepRejectionDetail != null ? JSON.stringify(params.stepRejectionDetail) : null;
  try {
    await sql`
      INSERT INTO store_verification_step_rejections (
        store_id,
        step_number,
        rejection_reason,
        step_label,
        rejected_by,
        rejected_by_name,
        email_sent,
        email_skip_reason,
        step_rejection_detail
      ) VALUES (
        ${params.storeId},
        ${params.stepNumber},
        ${params.reason},
        ${params.stepLabel},
        ${params.rejectedBy},
        ${params.rejectedByName},
        ${params.emailSent},
        ${params.emailSkipReason},
        ${detailJson}::jsonb
      )
      ON CONFLICT (store_id, step_number)
      DO UPDATE SET
        rejected_at = now(),
        rejection_reason = EXCLUDED.rejection_reason,
        step_label = EXCLUDED.step_label,
        rejected_by = EXCLUDED.rejected_by,
        rejected_by_name = EXCLUDED.rejected_by_name,
        email_sent = EXCLUDED.email_sent,
        email_skip_reason = EXCLUDED.email_skip_reason,
        merchant_resubmitted_at = NULL,
        step_rejection_detail = EXCLUDED.step_rejection_detail
    `;
    await insertStoreVerificationStepRejectionHistory({
      storeId: params.storeId,
      stepNumber: params.stepNumber,
      stepLabel: params.stepLabel,
      reason: params.reason,
      rejectedBy: params.rejectedBy,
      rejectedByName: params.rejectedByName,
      emailSent: params.emailSent,
      emailSkipReason: params.emailSkipReason,
      stepRejectionDetail: params.stepRejectionDetail ?? null,
    });
    return true;
  } catch (e) {
    console.error("[upsertStoreVerificationStepRejection]", e);
    return false;
  }
}

export async function clearStoreVerificationStepRejection(
  storeId: number,
  stepNumber: number
): Promise<boolean> {
  if (stepNumber < 1 || stepNumber > 7) return false;
  const sql = getSql();
  try {
    await sql`
      DELETE FROM store_verification_step_rejections
      WHERE store_id = ${storeId} AND step_number = ${stepNumber}
    `;
    return true;
  } catch (e) {
    console.error("[clearStoreVerificationStepRejection]", e);
    return false;
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
  if (params.stepNumber < 1 || params.stepNumber > 8) return false;
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
  if (params.stepNumber < 1 || params.stepNumber > 8) return false;
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
  if (stepNumber < 1 || stepNumber > 8) return false;
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
