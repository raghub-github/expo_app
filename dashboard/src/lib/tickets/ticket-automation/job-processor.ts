import type { getSql } from "@/lib/db/client";
import { getTicketQueueOfflineReleaseSettings } from "@/lib/tickets/ticket-queue-offline-settings";
import { runAgentOfflineAutomation, runAgentAutomation, runTicketAutomation } from "./engine";
import { runAgentOfflineAssignmentPass } from "./offline-reassign";

type SqlClient = ReturnType<typeof getSql>;

export type ProcessJobsOptions = {
  limit?: number;
  workerId?: string;
};

/**
 * Claims pending automation jobs and runs the engine (idempotent per job row).
 */
export async function processPendingAutomationJobs(
  sql: SqlClient,
  opts: ProcessJobsOptions = {}
): Promise<{ processed: number; jobErrors: string[] }> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 15));
  const workerId = opts.workerId ?? `w-${process.pid}-${Date.now()}`;
  const jobErrors: string[] = [];
  let processed = 0;

  for (let i = 0; i < limit; i++) {
    const claimedRows = (await sql`
      WITH c AS (
        SELECT id
        FROM public.ticket_automation_jobs
        WHERE status = 'pending' AND run_after <= now()
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.ticket_automation_jobs j
      SET status = 'processing',
          locked_at = now(),
          locked_by = ${workerId},
          attempts = COALESCE(j.attempts, 0) + 1,
          updated_at = now()
      FROM c
      WHERE j.id = c.id AND j.status = 'pending'
      RETURNING j.id, j.ticket_id, j.agent_user_id, j.trigger_event::text AS trigger_event, j.attempts, j.max_attempts
    `) as {
      id?: unknown;
      ticket_id?: unknown;
      agent_user_id?: unknown;
      trigger_event?: string;
      attempts?: unknown;
      max_attempts?: unknown;
    }[];

    const job = claimedRows[0];
    if (!job?.id) break;

    const jobId = Number(job.id);
    const trigger = String(job.trigger_event ?? "") as
      | "ticket_created"
      | "ticket_updated"
      | "ticket_reopened"
      | "agent_went_online"
      | "agent_went_offline";

    try {
      if (trigger === "agent_went_online") {
        const aid = job.agent_user_id != null ? Number(job.agent_user_id) : NaN;
        if (!Number.isFinite(aid)) throw new Error("agent_went_online job missing agent_user_id");
        await runAgentAutomation(sql, aid, { workerLabel: workerId });
      } else if (trigger === "agent_went_offline") {
        const aidOff = job.agent_user_id != null ? Number(job.agent_user_id) : NaN;
        if (!Number.isFinite(aidOff)) throw new Error("agent_went_offline job missing agent_user_id");
        const offlineSettings = await getTicketQueueOfflineReleaseSettings(sql);
        if (offlineSettings.releaseWhenAgentOffline) {
          await runAgentOfflineAssignmentPass(sql, aidOff, workerId, {
            maxTickets: offlineSettings.offlineReleaseMaxTickets,
          });
          await runAgentOfflineAutomation(sql, aidOff, { workerLabel: workerId });
        }
      } else {
        const tid = job.ticket_id != null ? Number(job.ticket_id) : NaN;
        if (!Number.isFinite(tid)) throw new Error("ticket job missing ticket_id");
        await runTicketAutomation(sql, trigger, tid, { workerLabel: workerId });
      }

      await sql`
        UPDATE public.ticket_automation_jobs
        SET status = 'completed', last_error = NULL, updated_at = now(), locked_at = NULL, locked_by = NULL
        WHERE id = ${jobId}
      `;

      await sql`
        INSERT INTO public.ticket_automation_logs (log_type, ticket_id, summary, details)
        VALUES (
          'job',
          ${job.ticket_id != null ? Number(job.ticket_id) : null},
          ${`Job ${jobId} completed`},
          ${JSON.stringify({ trigger, jobId })}::jsonb
        )
      `;

      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      jobErrors.push(`job ${jobId}: ${msg}`);
      const attempts = Number(job.attempts ?? 0);
      const maxAttempts = Number(job.max_attempts ?? 5);
      const nextStatus = attempts >= maxAttempts ? "dead" : "pending";
      const delaySec = Math.min(120, Math.max(5, attempts * 15));
      const runAfter = new Date(Date.now() + delaySec * 1000).toISOString();
      await sql`
        UPDATE public.ticket_automation_jobs
        SET status = ${nextStatus},
            last_error = ${msg.slice(0, 2000)},
            updated_at = now(),
            locked_at = NULL,
            locked_by = NULL,
            run_after = ${runAfter}::timestamptz
        WHERE id = ${jobId}
      `;
      try {
        await sql`
          INSERT INTO public.ticket_automation_logs (log_type, ticket_id, summary, details)
          VALUES (
            'error',
            ${job.ticket_id != null ? Number(job.ticket_id) : null},
            ${msg.slice(0, 500)},
            ${JSON.stringify({ jobId, trigger, attempts })}::jsonb
          )
        `;
      } catch {
        // ignore
      }
    }
  }

  return { processed, jobErrors };
}
