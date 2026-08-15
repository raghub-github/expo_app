import type { getSql } from "@/lib/db/client";
import {
  insertTicketActivityAudit,
  type TicketAuditSqlClient,
} from "@/lib/db/operations/ticket-activity-audit";

/** Main pool or transaction client (postgres.js types differ between the two). */
type SqlClient = ReturnType<typeof getSql>;

function auditSql(tx: SqlClient): TicketAuditSqlClient {
  return tx as unknown as TicketAuditSqlClient;
}

const TERMINAL_STATUSES = [
  "CLOSED",
  "REJECTED",
  "RESOLVED",
  "CANCELLED",
  "PROVISIONALLY_RESOLVED",
] as const;

const TERMINAL_STATUS_LIST = [...TERMINAL_STATUSES] as string[];

/**
 * A ticket whose assignee an agent/admin set by hand is off-limits to the
 * balancer — otherwise a manual assignment (or a deliberate "Unassigned") is
 * undone the next time any agent goes online or a group is rebalanced. The
 * predicate is spelled out inline below (postgres.js gives no clean way to
 * interpolate a constant fragment without building another nested query), using
 * `jsonb_exists(...)` rather than the `?` operator so the SQL carries no
 * characters that drivers and poolers like to reinterpret.
 */

/** Global cap from singleton settings (minimum 1). Falls back if migration not applied yet. */
export async function getMaxOpenTicketsPerAgent(sql: SqlClient): Promise<number> {
  try {
    const rows = (await sql`
      SELECT max_open_tickets_per_agent
      FROM public.ticket_queue_auto_assign_settings
      WHERE id = 1
      LIMIT 1
    `) as { max_open_tickets_per_agent?: number }[];
    const n = Number(rows[0]?.max_open_tickets_per_agent);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 6;
  } catch {
    return 6;
  }
}

function normalizeGroupIds(primary: unknown, secondary: unknown): number[] {
  const a = Array.isArray(primary) ? primary : [];
  const b = Array.isArray(secondary) ? secondary : [];
  const set = new Set<number>();
  for (const x of [...a, ...b]) {
    const n = Number(x);
    if (Number.isFinite(n)) set.add(n);
  }
  return [...set];
}

/**
 * Move excess assignments away from overloaded agents (same group, online assignees with room).
 */
export async function redistributeOverCapacityTickets(
  tx: SqlClient,
  groupIds: number[],
  maxCap: number
): Promise<number> {
  if (groupIds.length === 0 || maxCap < 1) return 0;
  let moved = 0;
  for (let iter = 0; iter < 200; iter++) {
    const overload = (await tx`
      SELECT ut.id AS ticket_id,
             ut.group_id AS gid,
             ut.assigned_to_agent_id AS from_aid,
             ut.priority::text AS priority
      FROM public.unified_tickets ut
      WHERE ut.group_id = ANY(${groupIds}::bigint[])
        AND ut.assigned_to_agent_id IS NOT NULL
        AND NOT (ut.status::text = ANY(${TERMINAL_STATUS_LIST}))
        AND NOT COALESCE(jsonb_exists(ut.metadata -> 'manual_overrides', 'assignee'), false)
        AND (
          SELECT COUNT(*)::int
          FROM public.unified_tickets x
          WHERE x.assigned_to_agent_id = ut.assigned_to_agent_id
            AND NOT (x.status::text = ANY(${TERMINAL_STATUS_LIST}))
        ) > LEAST(
          ${maxCap}::int,
          COALESCE(
            (SELECT apx.max_open_tickets_override
             FROM public.agent_profiles apx
             WHERE apx.user_id = ut.assigned_to_agent_id
             LIMIT 1),
            ${maxCap}::int
          )
        )
      ORDER BY
        CASE ut.priority::text
          WHEN 'LOW' THEN 0
          WHEN 'MEDIUM' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'URGENT' THEN 3
          WHEN 'CRITICAL' THEN 4
          ELSE 5
        END ASC,
        ut.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `) as {
      ticket_id?: unknown;
      gid?: unknown;
      from_aid?: unknown;
    }[];

    if (!overload.length) break;

    const ticketId = Number(overload[0].ticket_id);
    const gid = Number(overload[0].gid);
    const fromAid = Number(overload[0].from_aid);
    if (!Number.isFinite(ticketId) || !Number.isFinite(gid) || !Number.isFinite(fromAid)) break;

    const candidates = (await tx`
      SELECT qa.system_user_id AS uid,
        (SELECT COUNT(*)::int FROM public.unified_tickets ut2
          WHERE ut2.assigned_to_agent_id = qa.system_user_id
            AND NOT (ut2.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n,
        LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int)) AS eff_cap
      FROM public.ticket_agent_queue_assignments qa
      INNER JOIN public.agent_profiles ap ON ap.user_id = qa.system_user_id
      WHERE (${gid} = ANY (qa.primary_group_ids) OR ${gid} = ANY (qa.secondary_group_ids))
        AND qa.system_user_id <> ${fromAid}
        AND ap.is_online = true
        AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
      ORDER BY open_n ASC, qa.system_user_id ASC
    `) as { uid?: unknown; open_n?: unknown; eff_cap?: unknown }[];

    const pick = candidates.find((c) => Number(c.open_n) < Number(c.eff_cap ?? maxCap));
    if (!pick?.uid) break;

    const toAid = Number(pick.uid);
    const nameRow = (await tx`
      SELECT full_name, email FROM public.system_users WHERE id = ${toAid} LIMIT 1
    `) as { full_name?: string | null; email?: string | null }[];
    const name = nameRow[0]?.full_name ?? nameRow[0]?.email ?? null;

    const upd = (await tx`
      UPDATE public.unified_tickets
      SET assigned_to_agent_id = ${toAid},
          assigned_to_agent_name = ${name},
          assigned_at = now(),
          auto_assigned = true,
          updated_at = now()
      WHERE id = ${ticketId}
        AND assigned_to_agent_id = ${fromAid}
      RETURNING id
    `) as { id?: unknown }[];

    if (upd.length) {
      await tx`
        INSERT INTO public.ticket_assignment_history (
          ticket_id, agent_user_id, assignment_type, actor_user_id
        ) VALUES (${ticketId}, ${toAid}, 'rebalance', NULL)
      `;
      const fromNameRow = (await tx`
        SELECT full_name, email FROM public.system_users WHERE id = ${fromAid} LIMIT 1
      `) as { full_name?: string | null; email?: string | null }[];
      const fromName = fromNameRow[0]?.full_name ?? fromNameRow[0]?.email ?? null;
      await insertTicketActivityAudit(auditSql(tx), {
        ticket_id: ticketId,
        activity_type: "assignment",
        activity_category: "assignment",
        activity_description: `Assigned to ${name ?? "agent"} (Auto Assigned)`,
        actor_type: "SYSTEM",
        actor_name: "Queue",
        assigned_to_user_id: toAid,
        assigned_to_name: name ?? undefined,
        assigned_by_type: "auto_rebalance",
        previous_assignee_user_id: fromAid,
        previous_assignee_name: fromName ?? undefined,
      });
      moved++;
    }
  }
  return moved;
}

/**
 * Assign unassigned tickets in the agent's groups to online agents with lowest load, up to global max cap.
 * Uses priority (critical first) then created_at. Safe under concurrency via FOR UPDATE SKIP LOCKED.
 */
export async function runQueueBalanceAutoAssign(
  sql: SqlClient,
  opts: { forAgentUserId?: number; groupIds?: number[]; excludeAgentUserIds?: number[] }
): Promise<{ assigned: number }> {
  const maxCap = await getMaxOpenTicketsPerAgent(sql);
  const excludeIds = (opts.excludeAgentUserIds ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  let groupIds: number[] = [];

  if (opts.groupIds != null && opts.groupIds.length > 0) {
    groupIds = opts.groupIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  } else if (opts.forAgentUserId != null) {
    const qa = (await sql`
      SELECT primary_group_ids, secondary_group_ids
      FROM public.ticket_agent_queue_assignments
      WHERE system_user_id = ${opts.forAgentUserId}
      LIMIT 1
    `) as { primary_group_ids?: unknown; secondary_group_ids?: unknown }[];
    groupIds = normalizeGroupIds(qa[0]?.primary_group_ids, qa[0]?.secondary_group_ids);
  } else {
    const rows = (await sql`
      SELECT DISTINCT g.gid
      FROM public.ticket_agent_queue_assignments qa,
        LATERAL unnest(qa.primary_group_ids || qa.secondary_group_ids) AS g(gid)
    `) as { gid?: unknown }[];
    groupIds = rows.map((r) => Number(r.gid)).filter((n) => Number.isFinite(n));
  }

  if (groupIds.length === 0) {
    return { assigned: 0 };
  }

  let assigned = 0;

  await sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as SqlClient;

    await redistributeOverCapacityTickets(tx, groupIds, maxCap);

    for (const gid of groupIds) {
      if (!Number.isFinite(gid)) continue;

      for (;;) {
        const pending = (await tx`
          SELECT ut.id, ut.priority::text AS priority
          FROM public.unified_tickets ut
          WHERE ut.group_id = ${gid}
            AND ut.assigned_to_agent_id IS NULL
            AND ut.status::text IN ('OPEN', 'REOPENED')
            AND NOT COALESCE(jsonb_exists(ut.metadata -> 'manual_overrides', 'assignee'), false)
          ORDER BY
            CASE ut.priority::text
              WHEN 'CRITICAL' THEN 0
              WHEN 'URGENT' THEN 1
              WHEN 'HIGH' THEN 2
              WHEN 'MEDIUM' THEN 3
              WHEN 'LOW' THEN 4
              ELSE 5
            END ASC,
            ut.created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `) as { id?: unknown; priority?: string }[];

        if (!pending.length) break;

        const ticketId = Number(pending[0].id);

        const candidates = (await tx`
          SELECT qa.system_user_id AS uid,
            (SELECT COUNT(*)::int FROM public.unified_tickets ut2
              WHERE ut2.assigned_to_agent_id = qa.system_user_id
                AND NOT (ut2.status::text = ANY(${TERMINAL_STATUS_LIST}))) AS open_n,
            LEAST(${maxCap}::int, COALESCE(ap.max_open_tickets_override, ${maxCap}::int)) AS eff_cap
          FROM public.ticket_agent_queue_assignments qa
          INNER JOIN public.agent_profiles ap ON ap.user_id = qa.system_user_id
          WHERE (${gid} = ANY (qa.primary_group_ids) OR ${gid} = ANY (qa.secondary_group_ids))
            AND ap.is_online = true
            AND LOWER(COALESCE(ap.current_status::text, '')) = 'online'
            AND (${excludeIds.length} = 0 OR NOT (qa.system_user_id = ANY(${excludeIds}::bigint[])))
          ORDER BY open_n ASC, qa.system_user_id ASC
        `) as { uid?: unknown; open_n?: unknown; eff_cap?: unknown }[];

        const pick = candidates.find((c) => Number(c.open_n) < Number(c.eff_cap ?? maxCap));
        if (!pick?.uid) break;

        const agentId = Number(pick.uid);
        const nameRow = (await tx`
          SELECT full_name, email FROM public.system_users WHERE id = ${agentId} LIMIT 1
        `) as { full_name?: string | null; email?: string | null }[];
        const name = nameRow[0]?.full_name ?? nameRow[0]?.email ?? null;

        const upd = (await tx`
          UPDATE public.unified_tickets
          SET assigned_to_agent_id = ${agentId},
              assigned_to_agent_name = ${name},
              assigned_at = now(),
              auto_assigned = true,
              updated_at = now()
          WHERE id = ${ticketId}
            AND assigned_to_agent_id IS NULL
          RETURNING id
        `) as { id?: unknown }[];

        if (!upd.length) continue;

        await tx`
          INSERT INTO public.ticket_assignment_history (
            ticket_id, agent_user_id, assignment_type, actor_user_id
          ) VALUES (${ticketId}, ${agentId}, 'auto_balance', NULL)
        `;
        await insertTicketActivityAudit(auditSql(tx), {
          ticket_id: ticketId,
          activity_type: "assignment",
          activity_category: "assignment",
          activity_description: `Assigned to ${name ?? "agent"} (Auto Assigned)`,
          actor_type: "SYSTEM",
          actor_name: "Queue",
          assigned_to_user_id: agentId,
          assigned_to_name: name ?? undefined,
          assigned_by_type: "auto_balance",
        });
        assigned++;
      }
    }
  });

  return { assigned };
}
