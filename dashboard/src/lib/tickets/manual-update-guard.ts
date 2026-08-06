/**
 * Manual-override guard.
 *
 * Tickets normally follow the configured rules: the group-assignment rule picks
 * the queue, the priority rule sets priority, and queue balance picks an agent.
 * That is the desired behaviour for untouched tickets.
 *
 * But when an agent/admin explicitly sets a status, priority, group or assignee
 * — from the ticket detail view or from a bulk update — that choice must win.
 * Before this guard, `runTicketAutomation(..., "ticket_updated", ...)` fired on
 * the very same request and re-applied the rules, so a manual change was
 * reverted within milliseconds (most visibly: unassigning a ticket, which the
 * seeded `ticket_updated -> assign_least_loaded` rule immediately undid).
 *
 * The override is recorded per field on `unified_tickets.metadata.manual_overrides`
 * so it survives into the *queued* automation run too (the job processor has no
 * request context). It is sticky: the field stays human-owned until a human
 * changes it again or someone clears the override.
 */

import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

/** Ticket fields a human can take ownership of. */
export const MANUAL_OVERRIDE_FIELDS = ["status", "priority", "group", "assignee"] as const;
export type ManualOverrideField = (typeof MANUAL_OVERRIDE_FIELDS)[number];

export type ManualUpdateSource = "manual_single" | "manual_bulk";

export type ManualOverrideActor = {
  userId: number | null;
  name: string | null;
  email: string | null;
};

export type ManualOverrideEntry = {
  at: string;
  by_user_id: number | null;
  by_name: string | null;
  by_email: string | null;
  source: string;
  value: string | number | null;
};

export type ManualOverrideMap = Partial<Record<ManualOverrideField, ManualOverrideEntry>>;

function isManualOverrideField(value: unknown): value is ManualOverrideField {
  return (MANUAL_OVERRIDE_FIELDS as readonly string[]).includes(String(value));
}

/** Parse `metadata.manual_overrides` from a ticket row, tolerating legacy shapes. */
export function parseManualOverrides(metadata: unknown): ManualOverrideMap {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const raw = (metadata as Record<string, unknown>).manual_overrides;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ManualOverrideMap = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isManualOverrideField(key)) continue;
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    out[key] = {
      at: e.at != null ? String(e.at) : "",
      by_user_id: e.by_user_id != null && Number.isFinite(Number(e.by_user_id)) ? Number(e.by_user_id) : null,
      by_name: e.by_name != null ? String(e.by_name) : null,
      by_email: e.by_email != null ? String(e.by_email) : null,
      source: e.source != null ? String(e.source) : "manual",
      value: e.value == null ? null : (typeof e.value === "number" ? e.value : String(e.value)),
    };
  }
  return out;
}

/** Fields currently owned by a human, as a lookup set. */
export function manualOverrideFieldSet(overrides: ManualOverrideMap): Set<ManualOverrideField> {
  return new Set(Object.keys(overrides).filter(isManualOverrideField));
}

/**
 * Read the manual overrides currently stored on a ticket.
 * Never throws — a missing column/table must not break automation.
 */
export async function loadManualOverrides(
  sql: SqlClient,
  ticketId: number
): Promise<ManualOverrideMap> {
  try {
    const rows = (await sql`
      SELECT metadata
      FROM public.unified_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `) as { metadata?: unknown }[];
    return parseManualOverrides(rows[0]?.metadata);
  } catch (e) {
    console.warn("[manual-update-guard] loadManualOverrides failed:", (e as Error).message);
    return {};
  }
}

/**
 * Stamp the fields a human just set onto the ticket, together with who did it.
 *
 * Writes only `metadata.manual_overrides.<field>` — the `last_updated_by_*`
 * columns are set by the main UPDATE in `applyTicketUpdate`, because the
 * `log_ticket_activity()` trigger reads them on that same statement and a
 * follow-up write would arrive too late to attribute the activity rows.
 *
 * Since this statement changes nothing the trigger watches (status, priority,
 * assignee, group), it does not produce a second, spurious activity entry.
 */
export async function recordManualOverrides(
  sql: SqlClient,
  ticketId: number,
  fields: Array<{ field: ManualOverrideField; value: string | number | null }>,
  actor: ManualOverrideActor,
  source: ManualUpdateSource
): Promise<void> {
  if (fields.length === 0) return;

  const now = new Date().toISOString();
  const patch: Record<string, ManualOverrideEntry> = {};
  for (const { field, value } of fields) {
    patch[field] = {
      at: now,
      by_user_id: actor.userId,
      by_name: actor.name,
      by_email: actor.email,
      source,
      value,
    };
  }

  /**
   * `::text::jsonb`, not `::jsonb`.
   *
   * With a bare `::jsonb` cast Postgres reports the parameter as jsonb, and
   * postgres.js then runs its JSON serialiser over the already-stringified
   * value — the payload arrives double-encoded as a jsonb *string*, and
   * `'{}'::jsonb || <string>` yields an **array**. `manual_overrides` would then
   * be an array, `jsonb_exists(... , 'assignee')` would always be false, and the
   * whole override guard would silently do nothing. Casting text -> jsonb keeps
   * the parameter text-typed so it is encoded exactly once.
   */
  try {
    await sql`
      UPDATE public.unified_tickets
      SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{manual_overrides}',
            COALESCE(metadata -> 'manual_overrides', '{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb,
            true
          )
      WHERE id = ${ticketId}
    `;
  } catch (e) {
    console.warn("[manual-update-guard] recordManualOverrides failed:", (e as Error).message);
  }
}

/** Drop a human's claim on a field so the rules own it again. */
export async function clearManualOverrides(
  sql: SqlClient,
  ticketId: number,
  fields: ManualOverrideField[]
): Promise<void> {
  if (fields.length === 0) return;
  try {
    for (const field of fields) {
      await sql`
        UPDATE public.unified_tickets
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{manual_overrides}',
              COALESCE(metadata -> 'manual_overrides', '{}'::jsonb) - ${field},
              true
            ),
            updated_at = NOW()
        WHERE id = ${ticketId}
      `;
    }
  } catch (e) {
    console.warn("[manual-update-guard] clearManualOverrides failed:", (e as Error).message);
  }
}

/** Automation action types, mapped to the field they would write. */
const ACTION_TO_FIELD: Record<string, ManualOverrideField> = {
  set_status: "status",
  set_priority: "priority",
  set_group: "group",
  assign_to_agent: "assignee",
  assign_round_robin: "assignee",
  assign_least_loaded: "assignee",
  assign_priority_weighted: "assignee",
};

/** Which ticket field an automation action would overwrite, if any. */
export function actionTargetField(actionType: string): ManualOverrideField | null {
  return ACTION_TO_FIELD[actionType.trim().toLowerCase()] ?? null;
}

/** Human-readable reason recorded on the skipped automation action. */
export function manualOverrideSkipReason(
  field: ManualOverrideField,
  entry: ManualOverrideEntry | undefined
): string {
  const who = entry?.by_name ?? entry?.by_email ?? "an agent";
  const when = entry?.at ? ` at ${entry.at}` : "";
  return `skipped (${field} manually set by ${who}${when})`;
}
