/**
 * Merchant Portal Activity Logs — audit trail for agent changes.
 * Every modification in the Merchant Portal must create a log entry (backend).
 */

import { getSql } from "../client";

export type ActionType = "create" | "update" | "edit" | "delete";

export interface InsertActivityLogParams {
  storeId: number;
  agentId: number | null;
  changedSection: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changeReason?: string | null;
  actionType?: ActionType;
}

export interface ActivityLogRow {
  id: number;
  store_id: number;
  agent_id: number | null;
  changed_section: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  action_type: string;
  created_at: Date;
  updated_at: Date;
}

/** Serialize value for storage (always store both old and new). */
function toLogValue(v: unknown): string | null {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function insertActivityLog(params: InsertActivityLogParams): Promise<number | null> {
  const sql = getSql();
  const {
    storeId,
    agentId,
    changedSection,
    fieldName,
    oldValue,
    newValue,
    changeReason = null,
    actionType = "update",
  } = params;
  const result = await sql`
    INSERT INTO merchant_portal_activity_logs (
      store_id, agent_id, changed_section, field_name,
      old_value, new_value, change_reason, action_type
    )
    VALUES (
      ${storeId},
      ${agentId},
      ${changedSection},
      ${fieldName},
      ${oldValue != null ? oldValue : null},
      ${newValue != null ? newValue : null},
      ${changeReason ?? null},
      ${actionType}
    )
    RETURNING id
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return row ? Number((row as { id: number }).id) : null;
}

/** Log a single field change (convenience). */
export async function logFieldChange(
  storeId: number,
  agentId: number | null,
  section: string,
  fieldName: string,
  oldVal: unknown,
  newVal: unknown,
  changeReason?: string | null,
  actionType: ActionType = "update"
): Promise<void> {
  await insertActivityLog({
    storeId,
    agentId,
    changedSection: section,
    fieldName,
    oldValue: toLogValue(oldVal),
    newValue: toLogValue(newVal),
    changeReason,
    actionType,
  });
}

/** Fetch activity logs for a store, latest first. */
export async function getActivityLogsByStoreId(
  storeId: number,
  limit = 100
): Promise<ActivityLogRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, store_id, agent_id, changed_section, field_name,
           old_value, new_value, change_reason, action_type, created_at, updated_at
    FROM merchant_portal_activity_logs
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return (Array.isArray(rows) ? rows : [rows]) as ActivityLogRow[];
}
