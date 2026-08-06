/**
 * Single source of truth for "an agent/admin changed something on a ticket".
 *
 * `PATCH /api/tickets/[id]` and `POST /api/tickets/bulk-update` both go through
 * here so a bulk edit behaves exactly like four single edits:
 *   - the same validation,
 *   - the same manual-override stamp (so workflow rules cannot revert it),
 *   - the same audit trail, with the acting user on every field that changed.
 *
 * Automation is *enqueued*, never run inline. Running the engine inside the
 * request was what made a 4-ticket bulk update open four concurrent
 * `sql.begin()` transactions plus four job-processor loops on a small pool,
 * starving the list query behind it.
 */

import { getSystemUserById } from "@/lib/db/operations/users";
import {
  insertTicketActivityAudit,
  type TicketAuditSqlClient,
} from "@/lib/db/operations/ticket-activity-audit";
import { queueTicketAssignedNotification, queueTicketReopenedNotification } from "@/lib/tickets/ticket-notification-send";
import { validateAssigneeForTicket } from "@/lib/tickets/assignee-eligibility";
import { pickRoundRobinAssigneeForGroup } from "@/lib/tickets/round-robin-auto-assign";
import { enqueueTicketAutomationJob } from "@/lib/tickets/ticket-automation/enqueue-automation-job";
import {
  clearManualOverrides,
  recordManualOverrides,
  MANUAL_OVERRIDE_FIELDS,
  type ManualOverrideField,
  type ManualUpdateSource,
} from "@/lib/tickets/manual-update-guard";
import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

export type TicketUpdateActor = {
  id: number;
  name: string;
  email: string | null;
};

export type TicketUpdateBody = Record<string, unknown>;

export type ApplyTicketUpdateOptions = {
  /** Correlates every audit row written by one bulk action. */
  batchId?: string | null;
  source: ManualUpdateSource;
};

export type ApplyTicketUpdateResult =
  | { ok: true; ticketId: number; row: Record<string, unknown> | null; changedFields: string[] }
  | { ok: false; ticketId: number; status: number; error: string; code?: string };

/** Statuses a ticket can be reopened *from*. */
const TERMINAL_STATUSES = new Set([
  "RESOLVED",
  "CLOSED",
  "PROVISIONALLY_RESOLVED",
  "REJECTED",
  "CANCELLED",
]);

const ACTIVE_REOPEN_TARGETS = new Set([
  "OPEN",
  "REOPENED",
  "IN_PROGRESS",
  "PENDING",
  "WAITING_FOR_USER",
  "WAITING_FOR_MERCHANT",
  "WAITING_FOR_RIDER",
  "ESCALATED",
]);

/**
 * One assignment in the SET clause. Placeholders are written as `$?` and
 * numbered only when the statement is rendered, so fragments can be dropped
 * (see the schema-compatibility fallbacks) without renumbering by hand.
 */
type UpdateFragment = {
  sql: string;
  values: unknown[];
  /** Groups fragments that must be dropped together. */
  tag?: "tracking";
};

function renderUpdate(fragments: UpdateFragment[]): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const parts = fragments.map((fragment) => {
    let i = 0;
    const sql = fragment.sql.replace(/\$\?/g, () => {
      if (i >= fragment.values.length) {
        throw new Error(`update fragment has more $? placeholders than values: ${fragment.sql}`);
      }
      values.push(fragment.values[i++]);
      return `$${values.length}`;
    });
    if (i !== fragment.values.length) {
      throw new Error(`update fragment has unused values: ${fragment.sql}`);
    }
    return sql;
  });
  return { sql: parts.join(", "), values };
}

/**
 * Parse `releaseToRules`: `true` for every field, or a list of field names.
 *
 * A manual override is sticky — the field stays human-owned until someone hands
 * it back. This is that escape hatch, e.g. `{"releaseToRules": ["priority"]}`
 * puts the priority rule back in charge of the ticket.
 */
function normalizeReleaseFields(value: unknown): ManualOverrideField[] {
  if (value === true) return [...MANUAL_OVERRIDE_FIELDS];
  if (!Array.isArray(value)) return [];
  const wanted = new Set(value.map((v) => String(v).trim().toLowerCase()));
  return MANUAL_OVERRIDE_FIELDS.filter((f) => wanted.has(f));
}

async function releaseManualOverrides(
  sqlClient: SqlClient,
  sqlAudit: TicketAuditSqlClient,
  ticketId: number,
  fields: ManualOverrideField[],
  actor: TicketUpdateActor,
  batchId: string | null,
  source: ManualUpdateSource
): Promise<void> {
  await clearManualOverrides(sqlClient, ticketId, fields);
  await insertTicketActivityAudit(sqlAudit, {
    ticket_id: ticketId,
    activity_type: "manual_override_released",
    activity_category: "automation",
    activity_description: `Released to workflow rules: ${fields.join(", ")}`,
    actor_user_id: actor.id,
    actor_name: actor.name,
    actor_email: actor.email,
    actor_type: "AGENT",
    batch_id: batchId,
    update_source: source,
    changed_fields: fields,
  });
}

export function normalizeTicketAssigneeId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function upperStatus(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/-/g, "_");
}

/** Short, sortable id shared by every ticket in one bulk action. */
export function newBatchId(prefix = "bulk"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function applyTicketUpdate(
  sqlClient: SqlClient,
  ticketId: number,
  body: TicketUpdateBody,
  actor: TicketUpdateActor,
  opts: ApplyTicketUpdateOptions
): Promise<ApplyTicketUpdateResult> {
  const sqlAudit = sqlClient as unknown as TicketAuditSqlClient;
  const batchId = opts.batchId ?? null;
  const source = opts.source;

  const existingResult = (await sqlClient`
    SELECT id, status, priority, assigned_to_agent_id, assigned_to_agent_name, group_id, created_at,
           first_response_at, first_response_time_minutes, tags, is_spam, sla_due_at, metadata
    FROM public.unified_tickets WHERE id = ${ticketId} LIMIT 1
  `) as Record<string, unknown>[];

  if (!existingResult || existingResult.length === 0) {
    return { ok: false, ticketId, status: 404, error: "Ticket not found" };
  }

  const existing = existingResult[0];
  const existingStatusUpper = upperStatus(existing.status ?? "OPEN");

  // --- round-robin convenience path -----------------------------------------
  if (body.autoAssignRoundRobin === true) {
    if (body.currentAssigneeUserId !== undefined) {
      return {
        ok: false,
        ticketId,
        status: 400,
        error: "Cannot combine autoAssignRoundRobin with currentAssigneeUserId",
      };
    }
    if (normalizeTicketAssigneeId(existing.assigned_to_agent_id) != null) {
      return { ok: false, ticketId, status: 400, error: "Ticket already assigned" };
    }
    const gid = existing.group_id != null ? Number(existing.group_id) : NaN;
    if (!Number.isFinite(gid)) {
      return { ok: false, ticketId, status: 400, error: "Ticket has no group for auto-assign" };
    }
    const picked = await pickRoundRobinAssigneeForGroup(sqlClient, gid);
    if (picked == null) {
      return { ok: false, ticketId, status: 400, error: "No eligible agent for auto-assign" };
    }
    body = { ...body, currentAssigneeUserId: picked };
  }

  /**
   * SET-clause fragments keep their values attached and their placeholders
   * written as `$?`; numbering happens in `renderUpdate` at the very end.
   *
   * That matters because the compatibility fallbacks below drop fragments for
   * columns a given database may not have. Renumbering after the drop is the
   * only way to keep the placeholders contiguous — the previous version removed
   * a field and a value at the same array index, which are different lists, and
   * silently corrupted the statement whenever a fallback fired.
   */
  const updateFragments: UpdateFragment[] = [];
  /** Fields an agent/admin is claiming ownership of on this request. */
  const manualFields: Array<{ field: ManualOverrideField; value: string | number | null }> = [];
  /** Every column the request touched — recorded on each audit row. */
  const changedFields: string[] = [];
  let shouldClearSnoozeAfterUpdate = false;

  /** Fragment with one or more `$?` placeholders and its values, in order. */
  const push = (sql: string, ...values: unknown[]) => {
    updateFragments.push({ sql, values });
  };
  /** Fragment with no parameters. */
  const raw = (sql: string) => {
    updateFragments.push({ sql, values: [] });
  };

  if (body.status !== undefined) {
    const statusValue = upperStatus(body.status);
    changedFields.push("status");
    manualFields.push({ field: "status", value: statusValue });
    if (TERMINAL_STATUSES.has(existingStatusUpper) && ["OPEN", "REOPENED"].includes(statusValue)) {
      raw(`reopen_count = COALESCE(reopen_count, 0) + 1`);
    }
    push(`status = $?`, statusValue);
    if (statusValue !== "SNOOZED") shouldClearSnoozeAfterUpdate = true;
    if (statusValue === "RESOLVED") {
      raw(`resolved_at = COALESCE(resolved_at, NOW())`);
      push(`resolved_by = $?`, actor.id);
      push(`resolved_by_name = $?`, actor.name);
    } else if (statusValue === "CLOSED") {
      raw(`closed_at = COALESCE(closed_at, NOW())`);
      raw(`resolved_at = COALESCE(resolved_at, NOW())`);
      push(`resolved_by = COALESCE(resolved_by, $?)`, actor.id);
      push(`resolved_by_name = COALESCE(resolved_by_name, $?)`, actor.name);
    } else {
      raw(`resolved_at = NULL`);
      raw(`resolved_by = NULL`);
      raw(`resolved_by_name = NULL`);
      raw(`closed_at = NULL`);
    }
  }

  if (body.priority !== undefined) {
    const priorityValue = String(body.priority).toUpperCase();
    changedFields.push("priority");
    manualFields.push({ field: "priority", value: priorityValue });
    push(`priority = $?`, priorityValue);
  }

  if (body.currentAssigneeUserId !== undefined) {
    const assigneeNum = normalizeTicketAssigneeId(body.currentAssigneeUserId);
    changedFields.push("assigned_to_agent_id");
    manualFields.push({ field: "assignee", value: assigneeNum });

    if (assigneeNum != null) {
      // A group change in the same request is the group the assignee is checked against.
      const nextGroupId =
        body.groupId !== undefined
          ? (body.groupId == null ? null : Number(body.groupId))
          : existing.group_id != null
            ? Number(existing.group_id)
            : null;
      const check = await validateAssigneeForTicket(
        sqlClient,
        assigneeNum,
        nextGroupId != null && Number.isFinite(nextGroupId) ? nextGroupId : null,
        { enforceAvailability: false }
      );
      if (!check.ok) {
        return { ok: false, ticketId, status: 400, error: check.message, code: check.code };
      }
    }

    push(`assigned_to_agent_id = $?`, assigneeNum);
    let assigneeName: string | null = null;
    if (assigneeNum != null) {
      const assigneeUser = await getSystemUserById(assigneeNum);
      assigneeName = assigneeUser?.fullName ?? assigneeUser?.email ?? null;
    }
    push(`assigned_to_agent_name = $?`, assigneeName);
  }

  if (body.groupId !== undefined) {
    changedFields.push("group_id");
    const gid = body.groupId == null ? null : Number(body.groupId);
    manualFields.push({ field: "group", value: gid != null && Number.isFinite(gid) ? gid : null });
    push(`group_id = $?`, gid != null && Number.isFinite(gid) ? gid : null);
  }

  if (body.slaDueAt !== undefined) {
    // Pass the ISO string straight through and let Postgres cast text →
    // timestamptz. postgres.js is configured with `prepare: false` and the
    // `unsafe(query, values)` path doesn't reliably serialize Date objects
    // in simple-query mode (it falls into a Buffer.from() codepath that
    // throws `ERR_INVALID_ARG_TYPE: Received an instance of Date`).
    let isoOrNull: string | null = null;
    if (body.slaDueAt) {
      const parsed = new Date(String(body.slaDueAt));
      if (!Number.isNaN(parsed.getTime())) isoOrNull = parsed.toISOString();
    }
    changedFields.push("sla_due_at");
    push(`sla_due_at = $?::timestamptz`, isoOrNull);
  }

  if (body.tags !== undefined && Array.isArray(body.tags)) {
    changedFields.push("tags");
    push(
      `tags = $?`,
      (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "")
    );
  }

  if (body.isSpam !== undefined) {
    changedFields.push("is_spam");
    push(`is_spam = $?`, Boolean(body.isSpam));
  }

  /** Free-text ONDC / IGM fields — audited like everything else. */
  const textFields: Array<[string, string]> = [
    ["buyerNpName", "buyer_np_name"],
    ["sellerNpName", "seller_np_name"],
    ["logisticsNpName", "logistics_np_name"],
    ["igmActionTriggered", "igm_action_triggered"],
    ["igmShortResolution", "igm_short_resolution"],
    ["igmLongResolution", "igm_long_resolution"],
    ["groDetails", "gro_details"],
  ];
  for (const [key, column] of textFields) {
    if (body[key] === undefined) continue;
    changedFields.push(column);
    push(`${column} = $?`, body[key] ? String(body[key]) : null);
  }

  if (body.igmRefundAmount !== undefined) {
    changedFields.push("igm_refund_amount");
    const raw = body.igmRefundAmount;
    const n = raw == null || String(raw).trim() === "" ? null : Number(raw);
    push(`igm_refund_amount = $?`, n != null && Number.isFinite(n) ? n : null);
  }

  if (body.markFrt !== undefined) {
    if (body.markFrt !== true) {
      return { ok: false, ticketId, status: 400, error: "FRT can only be marked once" };
    }
    const alreadyMarkedByColumn = existing.first_response_at != null;
    const meta = existing.metadata;
    const alreadyMarkedByMeta = Boolean(
      meta && typeof meta === "object" && (meta as Record<string, unknown>).frt_marked
    );
    if (alreadyMarkedByColumn || alreadyMarkedByMeta) {
      return { ok: false, ticketId, status: 409, error: "FRT already marked and locked for this ticket" };
    }
    const createdAt = new Date(String(existing.created_at ?? new Date().toISOString()));
    const frtMins = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60000));
    changedFields.push("first_response_at");
    raw(`first_response_at = NOW()`);
    push(`first_response_time_minutes = $?`, frtMins);
    push(
      `metadata = jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{frt_marked}', 'true'::jsonb, true),
          '{frt_marked_at}',
          to_jsonb(NOW()::text),
          true
        ),
        '{frt_marked_by}',
        to_jsonb($?::text),
        true
      )`,
      String(actor.email ?? "")
    );
  }

  const releaseFields = normalizeReleaseFields(body.releaseToRules);

  if (updateFragments.length === 0) {
    // "Hand this field back to the rules" is a valid request on its own.
    if (releaseFields.length === 0) {
      return { ok: false, ticketId, status: 400, error: "No fields to update" };
    }
    await releaseManualOverrides(sqlClient, sqlAudit, ticketId, releaseFields, actor, batchId, source);
    return { ok: true, ticketId, row: null, changedFields: releaseFields };
  }

  /**
   * Who did it, written in the *same* statement as the field changes.
   *
   * `log_ticket_activity()` (the AFTER UPDATE trigger) reads these columns to
   * attribute its activity rows, so writing them in a follow-up UPDATE would be
   * too late — the trigger has already fired against the stale values, which is
   * why every dashboard edit used to be logged as the reporter or as "System".
   * Grouped under one tag so the whole block can be dropped on databases that
   * predate migration 0462.
   */
  const trackingStart = updateFragments.length;
  push(`last_updated_by_user_id = $?`, actor.id);
  push(`last_updated_by_name = $?`, actor.name);
  push(`last_updated_by_email = $?`, actor.email);
  push(`last_update_source = $?`, source);
  raw(`last_updated_at = NOW()`);
  for (let i = trackingStart; i < updateFragments.length; i++) {
    updateFragments[i].tag = "tracking";
  }

  raw(`updated_at = NOW()`);

  const returning =
    "id, ticket_id, status, is_spam, priority, assigned_to_agent_id, assigned_to_agent_name, group_id, tags, sla_due_at, first_response_at, first_response_time_minutes, metadata, updated_at";

  /**
   * The driver types `unsafe()` parameters as a closed union that cannot express
   * a heterogeneous list built at runtime; `TicketAuditSqlClient` is the
   * existing escape hatch for exactly this.
   */
  const sqlUnsafe = sqlClient as unknown as TicketAuditSqlClient;

  const runUpdate = (fragments: UpdateFragment[], returningCols: string) => {
    const { sql, values } = renderUpdate(fragments);
    return sqlUnsafe.unsafe(
      `UPDATE public.unified_tickets SET ${sql} WHERE id = $${values.length + 1} RETURNING ${returningCols}`,
      [...values, ticketId]
    ) as Promise<unknown[]>;
  };

  let updatedRows: unknown[];
  try {
    updatedRows = await runUpdate(updateFragments, returning);
  } catch (updateErr) {
    const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);

    // Pre-0462 database: drop the tracking columns and keep the edit working.
    if (msg.includes("last_updated_by") || msg.includes("last_update_source") || msg.includes("last_updated_at")) {
      const kept = updateFragments.filter((f) => f.tag !== "tracking");
      updatedRows = await runUpdate(kept, returning);
    } else if (msg.includes("group_id") && body.groupId !== undefined) {
      // Older databases without ticket_groups wiring: retry without the group column.
      const kept = updateFragments.filter((f) => !f.sql.startsWith("group_id"));
      if (kept.length === 0) throw updateErr;
      updatedRows = await runUpdate(kept, returning.replace(", group_id", ""));
    } else {
      throw updateErr;
    }
  }

  const updated = (Array.isArray(updatedRows) ? updatedRows[0] : null) as Record<string, unknown> | null;

  /**
   * Stamp the manual override *before* automation is enqueued, so the queued
   * `ticket_updated` run already sees which fields the human owns.
   */
  if (manualFields.length > 0) {
    await recordManualOverrides(
      sqlClient,
      ticketId,
      manualFields,
      { userId: actor.id, name: actor.name, email: actor.email },
      source
    );
  }

  if (releaseFields.length > 0) {
    await releaseManualOverrides(sqlClient, sqlAudit, ticketId, releaseFields, actor, batchId, source);
  }

  if (shouldClearSnoozeAfterUpdate) {
    try {
      await sqlClient`
        UPDATE public.unified_tickets
        SET snoozed_until = NULL, snooze_reason = NULL
        WHERE id = ${ticketId} AND status::text <> 'SNOOZED'
      `;
    } catch (snoozeClrErr) {
      console.warn("[applyTicketUpdate] clear snooze columns skipped:", snoozeClrErr);
    }
  }

  await writeAuditTrail({
    sqlAudit,
    sqlClient,
    ticketId,
    body,
    existing,
    updated,
    actor,
    batchId,
    source,
    changedFields,
  });

  await enqueueAutomationForUpdate(sqlClient, ticketId, existingStatusUpper, body, updated);

  return { ok: true, ticketId, row: updated, changedFields };
}

/**
 * Queue the workflow triggers this update should fire. Deliberately async —
 * `POST /api/tickets/automation/process-jobs` (already polled by the tickets UI)
 * drains them off the request path.
 */
export async function enqueueAutomationForUpdate(
  sqlClient: SqlClient,
  ticketId: number,
  previousStatusUpper: string,
  body: TicketUpdateBody,
  updated: Record<string, unknown> | null
): Promise<void> {
  try {
    const newStatus = upperStatus(updated?.status);
    const isReopen =
      body.status !== undefined &&
      TERMINAL_STATUSES.has(previousStatusUpper) &&
      ACTIVE_REOPEN_TARGETS.has(newStatus);

    if (isReopen) {
      await enqueueTicketAutomationJob(sqlClient, {
        ticketId,
        agentUserId: null,
        triggerEvent: "ticket_reopened",
        idempotencyKey: `reopen:${ticketId}:${Date.now()}`,
      });
    }
    await enqueueTicketAutomationJob(sqlClient, {
      ticketId,
      agentUserId: null,
      triggerEvent: "ticket_updated",
      idempotencyKey: `update:${ticketId}:${Date.now()}`,
    });
  } catch (autoErr) {
    // A ticket edit must still succeed when the job table is unavailable.
    console.error("[applyTicketUpdate] enqueue workflow automation:", autoErr);
  }
}

type AuditArgs = {
  sqlAudit: TicketAuditSqlClient;
  sqlClient: SqlClient;
  ticketId: number;
  body: TicketUpdateBody;
  existing: Record<string, unknown>;
  updated: Record<string, unknown> | null;
  actor: TicketUpdateActor;
  batchId: string | null;
  source: ManualUpdateSource;
  changedFields: string[];
};

/**
 * One audit row per thing that actually changed. Every row carries the acting
 * user, the batch id (so a bulk action is one traceable unit) and the full set
 * of columns the request touched.
 */
async function writeAuditTrail(args: AuditArgs): Promise<void> {
  const { sqlAudit, sqlClient, ticketId, body, existing, updated, actor, batchId, source, changedFields } = args;
  if (!updated) return;

  const base = {
    ticket_id: ticketId,
    actor_user_id: actor.id,
    actor_name: actor.name,
    actor_email: actor.email,
    actor_type: "AGENT" as const,
    batch_id: batchId,
    update_source: source,
    changed_fields: changedFields,
    is_manual_override: true,
  };

  // --- status ---------------------------------------------------------------
  if (body.status !== undefined && upperStatus(existing.status) !== upperStatus(updated.status)) {
    const newStatusUpper = upperStatus(updated.status);
    const spamRejected =
      newStatusUpper === "REJECTED" && (Boolean(body.isSpam) || updated.is_spam === true);
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "status_change",
      activity_category: "status_change",
      activity_description: spamRejected
        ? `Status changed from ${existing.status ?? "—"} to ${updated.status ?? "—"} (Spamed)`
        : `Status changed from ${existing.status ?? "—"} to ${updated.status ?? "—"}`,
      old_status: (existing.status as string) ?? null,
      new_status: (updated.status as string) ?? null,
    });

    if (newStatusUpper === "RESOLVED") {
      await insertTicketActivityAudit(sqlAudit, {
        ...base,
        activity_type: "resolved",
        activity_category: "resolution",
        activity_description: "Ticket resolved",
        resolved_by_user_id: actor.id,
        new_status: (updated.status as string) ?? null,
      });
    } else if (newStatusUpper === "CLOSED") {
      await insertTicketActivityAudit(sqlAudit, {
        ...base,
        activity_type: "closed",
        activity_category: "closure",
        activity_description: "Ticket closed",
        new_status: (updated.status as string) ?? null,
      });
    } else if (newStatusUpper === "REOPENED") {
      await insertTicketActivityAudit(sqlAudit, {
        ...base,
        activity_type: "reopened",
        activity_category: "reopened",
        activity_description: "Ticket reopened",
        old_status: (existing.status as string) ?? null,
        new_status: (updated.status as string) ?? null,
      });
      void queueTicketReopenedNotification(sqlAudit, ticketId).catch((e) =>
        console.error("[applyTicketUpdate] reopen notification email:", e)
      );
    }
  }

  // --- priority -------------------------------------------------------------
  if (
    body.priority !== undefined &&
    String(existing.priority ?? "").toUpperCase() !== String(updated.priority ?? "").toUpperCase()
  ) {
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "priority_change",
      activity_category: "priority_change",
      activity_description: `Priority changed from ${existing.priority ?? "—"} to ${updated.priority ?? "—"}`,
      old_priority: (existing.priority as string) ?? null,
      new_priority: (updated.priority as string) ?? null,
    });
  }

  // --- assignee -------------------------------------------------------------
  if (body.currentAssigneeUserId !== undefined) {
    const oldId = normalizeTicketAssigneeId(existing.assigned_to_agent_id);
    const newId = normalizeTicketAssigneeId(updated.assigned_to_agent_id);
    if (oldId !== newId) {
      if (newId == null) {
        await insertTicketActivityAudit(sqlAudit, {
          ...base,
          activity_type: "unassignment",
          activity_category: "unassignment",
          activity_description: `Unassigned from ${existing.assigned_to_agent_name ?? "agent"}`,
          previous_assignee_user_id: oldId ?? undefined,
          previous_assignee_name: (existing.assigned_to_agent_name as string) ?? undefined,
          unassigned_by_user_id: actor.id,
        });
      } else {
        await insertTicketActivityAudit(sqlAudit, {
          ...base,
          activity_type: "assignment",
          activity_category: "assignment",
          activity_description: `Assigned to ${updated.assigned_to_agent_name ?? "agent"}`,
          assigned_to_user_id: newId,
          assigned_to_name: (updated.assigned_to_agent_name as string) ?? undefined,
          assigned_by_type: "agent",
          previous_assignee_user_id: oldId ?? undefined,
          previous_assignee_name: (existing.assigned_to_agent_name as string) ?? undefined,
        });
        void queueTicketAssignedNotification(sqlAudit, ticketId, newId).catch((e) =>
          console.error("[applyTicketUpdate] assign notification email:", e)
        );
      }
    }
  }

  // --- group ----------------------------------------------------------------
  const oldGroupId = existing.group_id != null ? Number(existing.group_id) : null;
  const newGroupId = updated.group_id != null ? Number(updated.group_id) : null;
  if (body.groupId !== undefined && oldGroupId !== newGroupId) {
    const nameOf = async (id: number | null): Promise<string> => {
      if (id == null) return "—";
      try {
        const rows = (await sqlClient`
          SELECT group_name FROM public.ticket_groups WHERE id = ${id} LIMIT 1
        `) as { group_name?: string }[];
        return rows[0]?.group_name ?? String(id);
      } catch {
        return String(id);
      }
    };
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "group_change",
      activity_category: "group_change",
      activity_description: `Group changed from ${await nameOf(oldGroupId)} to ${await nameOf(newGroupId)}`,
      old_group_id: oldGroupId,
      new_group_id: newGroupId,
    });
  }

  // --- spam flag ------------------------------------------------------------
  if (body.isSpam !== undefined && Boolean(existing.is_spam) !== Boolean(updated.is_spam)) {
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "spam_flag_change",
      activity_category: "moderation",
      activity_description: updated.is_spam ? "Marked as spam" : "Spam flag cleared",
      old_value: { is_spam: Boolean(existing.is_spam) },
      new_value: { is_spam: Boolean(updated.is_spam) },
    });
  }

  // --- tags -----------------------------------------------------------------
  if (body.tags !== undefined) {
    const before = Array.isArray(existing.tags) ? (existing.tags as string[]) : [];
    const after = Array.isArray(updated.tags) ? (updated.tags as string[]) : [];
    const sameTags = before.length === after.length && before.every((t, i) => t === after[i]);
    if (!sameTags) {
      const added = after.filter((t) => !before.includes(t));
      const removed = before.filter((t) => !after.includes(t));
      await insertTicketActivityAudit(sqlAudit, {
        ...base,
        activity_type: "tags_change",
        activity_category: "tags_change",
        activity_description: [
          added.length ? `added ${added.join(", ")}` : null,
          removed.length ? `removed ${removed.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("; ") || "Tags updated",
        old_value: { tags: before },
        new_value: { tags: after },
      });
    }
  }

  // --- SLA due date ---------------------------------------------------------
  if (body.slaDueAt !== undefined) {
    const before = existing.sla_due_at != null ? String(existing.sla_due_at) : null;
    const after = updated.sla_due_at != null ? String(updated.sla_due_at) : null;
    if (before !== after) {
      await insertTicketActivityAudit(sqlAudit, {
        ...base,
        activity_type: "sla_due_change",
        activity_category: "sla",
        activity_description: `SLA due changed from ${before ?? "—"} to ${after ?? "—"}`,
        old_value: { sla_due_at: before },
        new_value: { sla_due_at: after },
      });
    }
  }

  // --- ONDC / IGM detail fields --------------------------------------------
  const detailFields: Array<[string, string, string]> = [
    ["buyerNpName", "buyer_np_name", "Buyer NP"],
    ["sellerNpName", "seller_np_name", "Seller NP"],
    ["logisticsNpName", "logistics_np_name", "Logistics NP"],
    ["igmActionTriggered", "igm_action_triggered", "IGM action"],
    ["igmShortResolution", "igm_short_resolution", "IGM short resolution"],
    ["igmLongResolution", "igm_long_resolution", "IGM long resolution"],
    ["igmRefundAmount", "igm_refund_amount", "IGM refund amount"],
    ["groDetails", "gro_details", "GRO details"],
  ];
  const touchedDetails = detailFields.filter(([key]) => body[key] !== undefined);
  if (touchedDetails.length > 0) {
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "ticket_details_updated",
      activity_category: "field_update",
      activity_description: `Updated ${touchedDetails.map(([, , label]) => label).join(", ")}`,
      old_value: Object.fromEntries(touchedDetails.map(([, col]) => [col, existing[col] ?? null])),
      new_value: Object.fromEntries(touchedDetails.map(([key, col]) => [col, body[key] ?? null])),
    });
  }

  // --- first response -------------------------------------------------------
  if (body.markFrt === true) {
    await insertTicketActivityAudit(sqlAudit, {
      ...base,
      activity_type: "first_response_marked",
      activity_category: "response",
      activity_description: "FRT Updated",
    });
  }
}
