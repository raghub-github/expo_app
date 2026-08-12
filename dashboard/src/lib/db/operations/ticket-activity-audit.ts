/**
 * Insert a row into unified_ticket_activity_audit.
 * Table may not exist (migration 0096); failures are logged and swallowed so APIs don't break.
 *
 * Important: with `prepare: false` / dual-bundled postgres.js, plain Objects and JS arrays
 * passed to `unsafe()` hit `Buffer.byteLength` → ERR_INVALID_ARG_TYPE. JSONB and array
 * columns must be sent as text + explicit casts.
 */

/** Postgres.js `sql` from `getSql()`, or a minimal `{ unsafe }` wrapper. */
export type TicketAuditSqlClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver `unsafe` uses postgres-specific types
  unsafe: (query: string, values?: any) => any;
};

type AuditPayload = {
  ticket_id: number;
  activity_type: string;
  activity_category: string;
  activity_description: string;
  actor_user_id?: number | null;
  actor_type?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  assigned_to_user_id?: number | null;
  assigned_to_name?: string | null;
  unassigned_by_user_id?: number | null;
  assigned_by_type?: string | null;
  previous_assignee_user_id?: number | null;
  previous_assignee_name?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  old_priority?: string | null;
  new_priority?: string | null;
  old_group_id?: number | null;
  new_group_id?: number | null;
  response_message_id?: number | null;
  response_type?: string | null;
  is_first_response?: boolean | null;
  resolved_by_user_id?: number | null;
  resolution_type?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  /** Columns this request touched (TEXT[]). */
  changed_fields?: string[] | null;
  /** Correlates every row written by one bulk action (migration 0462). */
  batch_id?: string | null;
  /** manual_single | manual_bulk | automation | queue_balance | system. */
  update_source?: string | null;
  /** True when a human explicitly set the value, overriding the workflow rules. */
  is_manual_override?: boolean | null;
};

/** Columns added by migration 0462 — dropped automatically on older databases. */
const OPTIONAL_COLUMNS = new Set(["batch_id", "update_source", "is_manual_override"]);

function jsonText(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value, (_, val) => (typeof val === "bigint" ? val.toString() : val));
  } catch {
    return null;
  }
}

/** Postgres text[] literal — safe for simple field-name tokens. */
function pgTextArrayLiteral(values: string[]): string {
  if (values.length === 0) return "{}";
  return `{${values
    .map((s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

export async function insertTicketActivityAudit(
  sqlClient: TicketAuditSqlClient,
  payload: AuditPayload
): Promise<void> {
  const cols = [
    "ticket_id",
    "activity_type",
    "activity_category",
    "activity_description",
    "actor_user_id",
    "actor_type",
    "actor_name",
    "actor_email",
    "actor_role",
    "assigned_to_user_id",
    "assigned_to_name",
    "unassigned_by_user_id",
    "assigned_by_type",
    "previous_assignee_user_id",
    "previous_assignee_name",
    "old_status",
    "new_status",
    "old_priority",
    "new_priority",
    "old_group_id",
    "new_group_id",
    "response_message_id",
    "response_type",
    "is_first_response",
    "resolved_by_user_id",
    "resolution_type",
    "old_value",
    "new_value",
    "changed_fields",
    "batch_id",
    "update_source",
    "is_manual_override",
  ];

  const build = (skip: Set<string>) => {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    const used: string[] = [];
    for (const key of cols) {
      if (skip.has(key)) continue;
      const v = payload[key as keyof AuditPayload];
      if (v === undefined) continue;

      const idx = placeholders.length + 1;
      if (key === "old_value" || key === "new_value") {
        // Text + ::jsonb avoids Object → Buffer.byteLength (ERR_INVALID_ARG_TYPE)
        // and avoids double-encoding that happens when the driver infers jsonb.
        placeholders.push(`$${idx}::jsonb`);
        values.push(jsonText(v));
      } else if (key === "changed_fields") {
        const arr = Array.isArray(v) ? v.map((x) => String(x)) : [String(v)];
        placeholders.push(`$${idx}::text[]`);
        values.push(pgTextArrayLiteral(arr));
      } else {
        placeholders.push(`$${idx}`);
        values.push(v);
      }
      used.push(key);
    }
    return { values, placeholders, used };
  };

  let { values, placeholders, used } = build(new Set());
  if (placeholders.length === 0) return;

  const run = async () =>
    sqlClient.unsafe(
      `INSERT INTO public.unified_ticket_activity_audit (${used.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );

  try {
    await run();
  } catch (e) {
    // Pre-0462 database: retry without the columns that migration added rather
    // than losing the audit row entirely.
    const msg = e instanceof Error ? e.message : String(e);
    const missingOptional = [...OPTIONAL_COLUMNS].some((c) => msg.includes(c));
    if (!missingOptional) {
      console.warn("[ticket-activity-audit] Insert failed (table may not exist):", e);
      return;
    }
    ({ values, placeholders, used } = build(OPTIONAL_COLUMNS));
    if (placeholders.length === 0) return;
    try {
      await run();
    } catch (e2) {
      console.warn("[ticket-activity-audit] Insert failed after column fallback:", e2);
    }
  }
}
