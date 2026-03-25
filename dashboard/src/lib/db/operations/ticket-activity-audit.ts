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
};

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
  ];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 0;
  for (const key of cols) {
    const v = payload[key as keyof AuditPayload];
    if (v !== undefined) {
      placeholders.push(`$${++idx}`);
      values.push(v);
    }
  }
  if (placeholders.length === 0) return;
  const colList = cols.filter((c) => payload[c as keyof AuditPayload] !== undefined).join(", ");
  const query = `INSERT INTO public.unified_ticket_activity_audit (${colList}) VALUES (${placeholders.join(", ")})`;
  try {
    await sqlClient.unsafe(query, values);
  } catch (e) {
    console.warn("[ticket-activity-audit] Insert failed (table may not exist):", e);
  }
}
