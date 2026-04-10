import type { getSql } from "@/lib/db/client";
import {
  insertTicketActivityAudit,
  type TicketAuditSqlClient,
} from "@/lib/db/operations/ticket-activity-audit";
import { enqueueTicketAutomationJob } from "./enqueue-automation-job";

type SqlClient = ReturnType<typeof getSql>;

const TERMINAL_STATUS_LIST = ["CLOSED", "RESOLVED", "REJECTED", "CANCELLED", "PROVISIONALLY_RESOLVED"];

function auditSql(tx: SqlClient): TicketAuditSqlClient {
  return tx as unknown as TicketAuditSqlClient;
}

/**
 * When an agent goes offline, release non-terminal open tickets so ticket_updated
 * automation can re-assign to online agents. Enqueues one job per ticket (deduped).
 */
export async function releaseOpenTicketsForOfflineAgent(
  sql: SqlClient,
  agentUserId: number,
  opts?: { maxTickets?: number }
): Promise<{ released: number; jobEnqueued: number; errors: string[] }> {
  const errors: string[] = [];
  let released = 0;
  let jobEnqueued = 0;
  const cap = Math.min(500, Math.max(1, opts?.maxTickets ?? 200));

  const rows = (await sql`
    SELECT id
    FROM public.unified_tickets
    WHERE assigned_to_agent_id = ${agentUserId}
      AND NOT (status::text = ANY (${TERMINAL_STATUS_LIST}))
    ORDER BY id ASC
    LIMIT ${cap}
  `) as { id?: unknown }[];

  const ticketIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));

  for (const ticketId of ticketIds) {
    try {
      let cleared = false;
      try {
        const upd = (await sql`
          UPDATE public.unified_tickets
          SET assigned_to_agent_id = NULL,
              assigned_to_agent_name = NULL,
              auto_assigned = false,
              assignment_type = 'released_offline',
              updated_at = now()
          WHERE id = ${ticketId}
            AND assigned_to_agent_id = ${agentUserId}
            AND NOT (status::text = ANY (${TERMINAL_STATUS_LIST}))
          RETURNING id
        `) as { id?: unknown }[];
        cleared = upd.length > 0;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("assignment_type")) throw e;
        const upd2 = (await sql`
          UPDATE public.unified_tickets
          SET assigned_to_agent_id = NULL,
              assigned_to_agent_name = NULL,
              auto_assigned = false,
              updated_at = now()
          WHERE id = ${ticketId}
            AND assigned_to_agent_id = ${agentUserId}
            AND NOT (status::text = ANY (${TERMINAL_STATUS_LIST}))
          RETURNING id
        `) as { id?: unknown }[];
        cleared = upd2.length > 0;
      }
      if (!cleared) continue;
      released++;

      try {
        await insertTicketActivityAudit(auditSql(sql), {
          ticket_id: ticketId,
          activity_type: "assignment",
          activity_category: "assignment",
          activity_description: `Assignee cleared — agent went offline (re-queue for auto-assign)`,
          actor_type: "SYSTEM",
          actor_name: "Auto-Assignment",
        });
      } catch {
        // non-fatal
      }

      const idem = `offline-release:${agentUserId}:ticket:${ticketId}:${Date.now()}`;
      const enq = await enqueueTicketAutomationJob(sql, {
        ticketId,
        agentUserId: null,
        triggerEvent: "ticket_updated",
        idempotencyKey: idem,
      });
      if (enq.inserted) jobEnqueued++;
    } catch (e) {
      errors.push(`ticket ${ticketId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { released, jobEnqueued, errors };
}

/**
 * Entry point from automation job worker when trigger_event = agent_went_offline.
 */
export async function runAgentOfflineAssignmentPass(
  sql: SqlClient,
  agentUserId: number,
  workerLabel?: string,
  opts?: { maxTickets?: number }
): Promise<{ released: number; jobEnqueued: number; errors: string[] }> {
  const out = await releaseOpenTicketsForOfflineAgent(sql, agentUserId, {
    maxTickets: opts?.maxTickets,
  });
  try {
    await sql`
      INSERT INTO public.ticket_automation_logs (log_type, actor_user_id, summary, details)
      VALUES (
        'job',
        ${agentUserId},
        ${`Agent offline pass: released ${out.released} tickets`},
        ${JSON.stringify({ worker: workerLabel ?? null, ...out })}::jsonb
      )
    `;
  } catch {
    // ignore logging failures
  }
  return { released: out.released, jobEnqueued: out.jobEnqueued, errors: out.errors };
}
