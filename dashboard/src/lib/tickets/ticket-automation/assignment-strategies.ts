import type { getSql } from "@/lib/db/client";
import { getMaxOpenTicketsPerAgent } from "@/lib/tickets/queue-balance-auto-assign";
import { pickRoundRobinAssigneeForGroup } from "@/lib/tickets/round-robin-auto-assign";

type SqlClient = ReturnType<typeof getSql>;

const TERMINAL_STATUS_LIST = ["CLOSED", "REJECTED", "RESOLVED", "CANCELLED", "PROVISIONALLY_RESOLVED"];

/**
 * Lowest open-ticket count among online agents mapped to the group (primary or secondary).
 */
export async function pickLeastLoadedAgentForGroup(
  sql: SqlClient,
  ticketGroupId: number
): Promise<number | null> {
  const maxCap = await getMaxOpenTicketsPerAgent(sql);
  const rows = (await sql`
    SELECT qa.system_user_id AS uid,
           (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n,
           LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int)) AS eff_cap
    FROM public.ticket_agent_queue_assignments qa
    INNER JOIN (
      SELECT DISTINCT ON (user_id)
        user_id, is_online, current_status, max_open_tickets_override
      FROM public.agent_profiles
      ORDER BY user_id, updated_at DESC NULLS LAST, id DESC
    ) ap ON ap.user_id = qa.system_user_id
    WHERE (${ticketGroupId} = ANY(qa.primary_group_ids) OR ${ticketGroupId} = ANY(qa.secondary_group_ids))
      AND ap.is_online = true
      AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
    ORDER BY open_n ASC, qa.system_user_id ASC
  `) as { uid?: unknown; open_n?: unknown; eff_cap?: unknown }[];

  const pick = rows.find((c) => Number(c.open_n) < Number(c.eff_cap ?? maxCap));
  const uid = pick?.uid;
  if (uid == null) return null;
  const n = Number(uid);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prefer agents with fewer URGENT/CRITICAL open tickets, then fewer total open.
 */
export async function pickPriorityWeightedAgentForGroup(
  sql: SqlClient,
  ticketGroupId: number
): Promise<number | null> {
  const maxCap = await getMaxOpenTicketsPerAgent(sql);
  const rows = (await sql`
    SELECT qa.system_user_id AS uid,
           (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))
               AND ut.priority::text = ANY(ARRAY['URGENT','CRITICAL']::text[])) AS urgent_n,
           (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n,
           LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int)) AS eff_cap
    FROM public.ticket_agent_queue_assignments qa
    INNER JOIN (
      SELECT DISTINCT ON (user_id)
        user_id, is_online, current_status, max_open_tickets_override
      FROM public.agent_profiles
      ORDER BY user_id, updated_at DESC NULLS LAST, id DESC
    ) ap ON ap.user_id = qa.system_user_id
    WHERE (${ticketGroupId} = ANY(qa.primary_group_ids) OR ${ticketGroupId} = ANY(qa.secondary_group_ids))
      AND ap.is_online = true
      AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
    ORDER BY urgent_n ASC, open_n ASC, qa.system_user_id ASC
  `) as { uid?: unknown; open_n?: unknown; eff_cap?: unknown }[];

  const pick = rows.find((c) => Number(c.open_n) < Number(c.eff_cap ?? maxCap));
  const uid = pick?.uid;
  if (uid == null) return null;
  const n = Number(uid);
  return Number.isFinite(n) ? n : null;
}

export { pickRoundRobinAssigneeForGroup };
