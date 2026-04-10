import { getMaxOpenTicketsPerAgent } from "@/lib/tickets/queue-balance-auto-assign";

type SqlClient = ReturnType<typeof import("@/lib/db/client").getSql>;

type Tier = "primary" | "secondary";

const TERMINAL_STATUS_LIST = ["CLOSED", "REJECTED", "RESOLVED", "CANCELLED", "PROVISIONALLY_RESOLVED"];

const MIN_CYCLE = 1;
const MAX_CYCLE = 50;

function clampCycle(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, Math.floor(n)));
}

/**
 * Picks next online agent for auto-assignment using N:M primary:secondary rhythm
 * (N consecutive picks from primary-mapped agents, then M from secondary, repeat).
 * Respects offline/break and queue group mappings. Returns null if no candidate.
 */
export async function pickRoundRobinAssigneeForGroup(
  sql: SqlClient,
  ticketGroupId: number
): Promise<number | null> {
  const maxCap = await getMaxOpenTicketsPerAgent(sql);

  const distRows = (await sql`
    SELECT primary_slots_remaining,
           secondary_slots_remaining,
           primary_per_cycle,
           secondary_per_cycle
    FROM public.ticket_auto_assign_distribution
    WHERE id = 1
    LIMIT 1
  `) as {
    primary_slots_remaining?: unknown;
    secondary_slots_remaining?: unknown;
    primary_per_cycle?: unknown;
    secondary_per_cycle?: unknown;
  }[];

  const row = distRows[0];
  const primaryPerCycle = clampCycle(Number(row?.primary_per_cycle ?? 2) || 2);
  const secondaryPerCycle = clampCycle(Number(row?.secondary_per_cycle ?? 1) || 1);

  let primaryLeft = Math.max(0, Math.floor(Number(row?.primary_slots_remaining ?? primaryPerCycle)));
  if (!Number.isFinite(primaryLeft) || primaryLeft > primaryPerCycle) primaryLeft = primaryPerCycle;

  let secondaryLeft = Math.max(0, Math.floor(Number(row?.secondary_slots_remaining ?? 0)));
  if (!Number.isFinite(secondaryLeft) || secondaryLeft > secondaryPerCycle) secondaryLeft = 0;

  const tier: Tier = primaryLeft > 0 ? "primary" : "secondary";
  const picked = await pickAgentInTier(sql, ticketGroupId, tier, maxCap);
  if (picked == null) return null;

  let nextPrimary = primaryLeft;
  let nextSecondary = secondaryLeft;

  if (tier === "primary") {
    nextPrimary = Math.max(0, primaryLeft - 1);
  } else {
    if (nextSecondary === 0) {
      nextSecondary = secondaryPerCycle;
    }
    nextSecondary = Math.max(0, nextSecondary - 1);
    if (nextSecondary === 0) {
      nextPrimary = primaryPerCycle;
    }
  }

  await sql`
    INSERT INTO public.ticket_auto_assign_distribution (
      id,
      primary_slots_remaining,
      secondary_slots_remaining,
      primary_per_cycle,
      secondary_per_cycle,
      updated_at
    )
    VALUES (1, ${nextPrimary}, ${nextSecondary}, ${primaryPerCycle}, ${secondaryPerCycle}, now())
    ON CONFLICT (id) DO UPDATE SET
      primary_slots_remaining = EXCLUDED.primary_slots_remaining,
      secondary_slots_remaining = EXCLUDED.secondary_slots_remaining,
      updated_at = EXCLUDED.updated_at
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
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST})))
          < LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int))
    ORDER BY open_n ASC, qa.system_user_id ASC
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
               AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST})))
          < LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int))
    ORDER BY open_n ASC, qa.system_user_id ASC
    LIMIT 1
  `) as { uid?: unknown }[]);

  const uid = rows[0]?.uid;
  if (uid == null) return null;
  const n = Number(uid);
  return Number.isFinite(n) ? n : null;
}
