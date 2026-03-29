import { getMaxOpenTicketsPerAgent } from "@/lib/tickets/queue-balance-auto-assign";

type SqlClient = ReturnType<typeof import("@/lib/db/client").getSql>;

type Tier = "primary" | "secondary";

const TERMINAL_STATUS_LIST = ["CLOSED", "REJECTED", "RESOLVED", "CANCELLED"];

/**
 * Picks next online agent for auto-assignment using 2:1 primary:secondary rhythm
 * (two consecutive picks from primary-mapped agents for the group, then one from secondary).
 * Respects offline/break and queue group mappings. Returns null if no candidate.
 */
export async function pickRoundRobinAssigneeForGroup(
  sql: SqlClient,
  ticketGroupId: number
): Promise<number | null> {
  const maxCap = await getMaxOpenTicketsPerAgent(sql);

  const distRows = (await sql`
    SELECT primary_slots_remaining
    FROM public.ticket_auto_assign_distribution
    WHERE id = 1
    LIMIT 1
  `) as { primary_slots_remaining?: number }[];

  let slots = Math.max(0, Number(distRows[0]?.primary_slots_remaining ?? 2) || 2);
  if (slots > 2) slots = 2;

  const tier: Tier = slots > 0 ? "primary" : "secondary";
  const picked = await pickAgentInTier(sql, ticketGroupId, tier, maxCap);
  if (picked == null) return null;

  let nextSlots = slots;
  if (tier === "primary") {
    nextSlots = Math.max(0, slots - 1);
  } else {
    nextSlots = 2;
  }

  await sql`
    INSERT INTO public.ticket_auto_assign_distribution (id, primary_slots_remaining, updated_at)
    VALUES (1, ${nextSlots}, now())
    ON CONFLICT (id) DO UPDATE SET
      primary_slots_remaining = ${nextSlots},
      updated_at = now()
  `;

  return picked;
}

async function pickAgentInTier(
  sql: SqlClient,
  groupId: number,
  tier: Tier,
  maxCap: number
): Promise<number | null> {
  const rows =
    tier === "primary"
      ? ((await sql`
    SELECT qa.system_user_id AS uid,
           (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n
    FROM public.ticket_agent_queue_assignments qa
    INNER JOIN public.agent_profiles ap ON ap.user_id = qa.system_user_id
    WHERE ${groupId} = ANY(qa.primary_group_ids)
      AND ap.is_online = true
      AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
      AND (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) < ${maxCap}
    ORDER BY open_n ASC, random()
    LIMIT 1
  `) as { uid?: unknown }[])
      : ((await sql`
    SELECT qa.system_user_id AS uid,
           (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n
    FROM public.ticket_agent_queue_assignments qa
    INNER JOIN public.agent_profiles ap ON ap.user_id = qa.system_user_id
    WHERE ${groupId} = ANY(qa.secondary_group_ids)
      AND ap.is_online = true
      AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
      AND (SELECT COUNT(*)::int FROM public.unified_tickets ut
             WHERE ut.assigned_to_agent_id = qa.system_user_id
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))) < ${maxCap}
    ORDER BY open_n ASC, random()
    LIMIT 1
  `) as { uid?: unknown }[]);

  const uid = rows[0]?.uid;
  if (uid == null) return null;
  const n = Number(uid);
  return Number.isFinite(n) ? n : null;
}
