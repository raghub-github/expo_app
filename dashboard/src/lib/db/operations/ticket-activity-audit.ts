/**
 * Insert a row into unified_ticket_activity_audit.
 * Table may not exist (migration 0096); failures are logged and swallowed so APIs don't break.
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

export async function insertTicketActivityAudit(
  sqlClient: TicketAuditSqlClient,
  payload: AuditPayload
): Promise<void> {
  const normalizeValue = (key: string, value: unknown): unknown => {
    if (value == null) return value;
    // changed_fields is a real TEXT[] — hand the array to the driver, don't JSON it.
    if (key === "changed_fields") {
      return Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
    }
    /**
     * old_value / new_value are JSONB columns. Pass the object through as-is.
     *
     * This used to JSON.stringify first, which double-encodes: Postgres reports
     * the parameter as jsonb (inferred from the column), so postgres.js runs its
     * own JSON serialiser over the string and the row lands as a jsonb *string*
     * like "\"{\\\"tags\\\":[...]}\"" instead of an object — unqueryable with
     * `->>` and misleading in the activity feed. Handing over the object lets the
     * driver encode it exactly once.
     */
    return value;
  };
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
      placeholders.push(`$${placeholders.length + 1}`);
      values.push(normalizeValue(key, v));
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
