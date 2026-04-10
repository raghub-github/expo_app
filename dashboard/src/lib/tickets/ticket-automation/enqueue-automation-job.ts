import type { getSql } from "@/lib/db/client";
import type { AutomationTriggerEvent } from "./types";

type SqlClient = ReturnType<typeof getSql>;

export type EnqueueJobInput = {
  ticketId: number | null;
  agentUserId: number | null;
  triggerEvent: AutomationTriggerEvent;
  idempotencyKey?: string | null;
  runAfter?: Date;
};

/**
 * Inserts a workflow automation job. When idempotency_key is set, skips insert if key already exists.
 */
export async function enqueueTicketAutomationJob(
  sql: SqlClient,
  input: EnqueueJobInput
): Promise<{ inserted: boolean; jobId: number | null }> {
  const { ticketId, agentUserId, triggerEvent } = input;
  const idem = input.idempotencyKey?.trim() || null;
  const runAfter = input.runAfter ?? new Date();

  if (idem) {
    const dup = (await sql`
      SELECT id FROM public.ticket_automation_jobs
      WHERE idempotency_key = ${idem}
        AND status = ANY (ARRAY['pending'::text, 'processing'::text])
      LIMIT 1
    `) as { id?: unknown }[];
    if (dup.length) {
      return { inserted: false, jobId: dup[0].id != null ? Number(dup[0].id) : null };
    }
  }

  try {
    const ins = (await sql`
      INSERT INTO public.ticket_automation_jobs (
        ticket_id, agent_user_id, trigger_event, status, run_after, idempotency_key
      ) VALUES (
        ${ticketId},
        ${agentUserId},
        ${triggerEvent},
        'pending',
        ${runAfter.toISOString()}::timestamptz,
        ${idem}
      )
      RETURNING id
    `) as { id?: unknown }[];
    const jobId = ins[0]?.id != null ? Number(ins[0].id) : null;
    return { inserted: true, jobId: Number.isFinite(jobId) ? jobId : null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { inserted: false, jobId: null };
    }
    throw e;
  }
}
