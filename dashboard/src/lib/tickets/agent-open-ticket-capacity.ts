import { getMaxOpenTicketsPerAgent } from "@/lib/tickets/queue-balance-auto-assign";

type SqlClient = ReturnType<typeof import("@/lib/db/client").getSql>;

const TERMINAL = ["CLOSED", "REJECTED", "RESOLVED", "CANCELLED", "PROVISIONALLY_RESOLVED"] as string[];

/**
 * Effective max open (non-terminal) tickets for an agent: LEAST(global_settings, per-agent override or global).
 */
export async function getEffectiveMaxOpenForAgent(sql: SqlClient, agentUserId: number): Promise<number> {
  const globalCap = await getMaxOpenTicketsPerAgent(sql);
  try {
    const rows = (await sql`
      SELECT max_open_tickets_override
      FROM public.agent_profiles
      WHERE user_id = ${agentUserId}
      LIMIT 1
    `) as { max_open_tickets_override?: number | null }[];
    const o = rows[0]?.max_open_tickets_override;
    if (o == null || !Number.isFinite(Number(o))) return globalCap;
    const personal = Math.min(500, Math.max(1, Math.floor(Number(o))));
    return Math.min(globalCap, personal);
  } catch {
    return globalCap;
  }
}

export async function countOpenTicketsForAgent(sql: SqlClient, agentUserId: number): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM public.unified_tickets ut
    WHERE ut.assigned_to_agent_id = ${agentUserId}
      AND NOT (ut.status::text = ANY (${TERMINAL}))
  `) as { n?: number }[];
  return Number(rows[0]?.n) || 0;
}

export type AgentCapacityCheck =
  | { ok: true; open: number; effectiveCap: number }
  | { ok: false; open: number; effectiveCap: number; reason: string };

export async function checkAgentOpenTicketCapacity(
  sql: SqlClient,
  agentUserId: number
): Promise<AgentCapacityCheck> {
  const effectiveCap = await getEffectiveMaxOpenForAgent(sql, agentUserId);
  const open = await countOpenTicketsForAgent(sql, agentUserId);
  if (open >= effectiveCap) {
    return {
      ok: false,
      open,
      effectiveCap,
      reason: `Agent at capacity (${open}/${effectiveCap} open tickets)`,
    };
  }
  return { ok: true, open, effectiveCap };
}

export async function logAssignmentSkipped(
  sql: SqlClient,
  opts: { ticketId: number | null; agentUserId?: number | null; summary: string; details?: Record<string, unknown> }
): Promise<void> {
  try {
    await sql`
      INSERT INTO public.ticket_automation_logs (log_type, ticket_id, actor_user_id, summary, details)
      VALUES (
        'assignment_skip',
        ${opts.ticketId},
        ${opts.agentUserId ?? null},
        ${opts.summary.slice(0, 500)},
        ${JSON.stringify(opts.details ?? {})}::jsonb
      )
    `;
  } catch (e) {
    console.warn("[logAssignmentSkipped]", e instanceof Error ? e.message : e);
  }
}
