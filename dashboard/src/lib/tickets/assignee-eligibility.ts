type SqlClient = ReturnType<typeof import("@/lib/db/client").getSql>;

export const ASSIGNEE_ERROR_NO_GROUPS = "No Group assigned to the User";
export const ASSIGNEE_ERROR_OFFLINE = "Agent is offline or unavailable for assignment";
export const ASSIGNEE_ERROR_GROUP_MISMATCH = "Agent is not assigned to this ticket group (primary/secondary)";

export type AssigneeValidationCode = "NO_GROUPS_ASSIGNED" | "AGENT_OFFLINE" | "GROUP_NOT_ALLOWED";

export type AssigneeValidationResult =
  | { ok: true }
  | { ok: false; code: AssigneeValidationCode; message: string };

/**
 * Validates manual (or auto) assignee changes: agent must be online/available,
 * must have at least one primary or secondary group, and ticket group must be allowed.
 */
export async function validateAssigneeForTicket(
  sql: SqlClient,
  assigneeUserId: number,
  ticketGroupId: number | null,
  options?: { enforceAvailability?: boolean }
): Promise<AssigneeValidationResult> {
  const profRows = (await sql`
    SELECT current_status, is_online
    FROM public.agent_profiles
    WHERE user_id = ${assigneeUserId}
    LIMIT 1
  `) as { current_status?: string; is_online?: boolean }[];

  const status = (profRows[0]?.current_status ?? "offline").toLowerCase();
  const online = profRows[0]?.is_online === true;

  const enforceAvailability = options?.enforceAvailability !== false;
  if (
    enforceAvailability &&
    (!online || status === "offline" || status === "break" || status === "busy")
  ) {
    return { ok: false, code: "AGENT_OFFLINE", message: ASSIGNEE_ERROR_OFFLINE };
  }

  const qaRows = (await sql`
    SELECT primary_group_ids, secondary_group_ids
    FROM public.ticket_agent_queue_assignments
    WHERE system_user_id = ${assigneeUserId}
    LIMIT 1
  `) as { primary_group_ids?: unknown; secondary_group_ids?: unknown }[];

  const primary = normalizeBigIntArray(qaRows[0]?.primary_group_ids);
  const secondary = normalizeBigIntArray(qaRows[0]?.secondary_group_ids);
  const allowed = new Set([...primary, ...secondary]);

  if (allowed.size === 0) {
    return { ok: false, code: "NO_GROUPS_ASSIGNED", message: ASSIGNEE_ERROR_NO_GROUPS };
  }

  if (ticketGroupId != null && Number.isFinite(ticketGroupId)) {
    if (!allowed.has(ticketGroupId)) {
      return { ok: false, code: "GROUP_NOT_ALLOWED", message: ASSIGNEE_ERROR_GROUP_MISMATCH };
    }
  }

  return { ok: true };
}

function normalizeBigIntArray(v: unknown): number[] {
  if (v == null) return [];
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}
