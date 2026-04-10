import type { getSql } from "@/lib/db/client";
import { runQueueBalanceAutoAssign } from "@/lib/tickets/queue-balance-auto-assign";
import { applyActionListWithReload, applyFallbackRoutingGroupIfNeeded } from "./apply-actions";
import { getTicketAutoAssignmentGate } from "./assignment-eligibility";
import { evaluateConditions } from "./condition-eval";
import type {
  ActionRow,
  AgentSnapshot,
  AutomationContext,
  AutomationRuleRow,
  AutomationTriggerEvent,
  ConditionRow,
  TicketSnapshot,
} from "./types";

type SqlClient = ReturnType<typeof getSql>;

async function loadRules(sql: SqlClient, event: AutomationTriggerEvent): Promise<AutomationRuleRow[]> {
  const rows = (await sql`
    SELECT id, rule_code, rule_name, rule_description, rule_priority, trigger_event::text AS trigger_event,
           is_enabled, is_active, once_per_ticket, stop_after_match, execution_mode::text AS execution_mode,
           execution_delay_seconds, max_action_retries, version
    FROM public.ticket_automation_rules
    WHERE is_active = true AND is_enabled = true AND trigger_event = ${event}
    ORDER BY rule_priority DESC, id ASC
  `) as AutomationRuleRow[];
  return rows ?? [];
}

export async function loadConditions(sql: SqlClient, ruleId: number): Promise<ConditionRow[]> {
  const rows = (await sql`
    SELECT id, rule_id, sort_order, field, operator, value, combine_with_previous
    FROM public.ticket_automation_rule_conditions
    WHERE rule_id = ${ruleId}
    ORDER BY sort_order ASC, id ASC
  `) as ConditionRow[];
  return rows ?? [];
}

export async function loadActions(sql: SqlClient, ruleId: number): Promise<ActionRow[]> {
  const rows = (await sql`
    SELECT id, rule_id, sort_order, action_type, payload, combine_with_previous
    FROM public.ticket_automation_rule_actions
    WHERE rule_id = ${ruleId}
    ORDER BY sort_order ASC, id ASC
  `) as ActionRow[];
  return (rows ?? []).map((r) => ({
    ...r,
    payload: (r.payload && typeof r.payload === "object" ? r.payload : {}) as Record<string, unknown>,
  }));
}

export async function loadTicketSnapshot(sql: SqlClient, ticketId: number): Promise<TicketSnapshot | null> {
  const rows = (await sql`
    SELECT id,
           status::text AS status,
           priority::text AS priority,
           group_id,
           ticket_type::text AS ticket_type,
           ticket_category::text AS ticket_category,
           service_type::text AS service_type,
           raised_by_type::text AS raised_by_type,
           ticket_source::text AS ticket_source,
           assigned_to_agent_id,
           tags,
           subject,
           description,
           ticket_title
    FROM public.unified_tickets
    WHERE id = ${ticketId}
    LIMIT 1
  `) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    status: r.status != null ? String(r.status) : null,
    priority: r.priority != null ? String(r.priority) : null,
    group_id: r.group_id != null ? Number(r.group_id) : null,
    ticket_type: r.ticket_type != null ? String(r.ticket_type) : null,
    ticket_category: r.ticket_category != null ? String(r.ticket_category) : null,
    service_type: r.service_type != null ? String(r.service_type) : null,
    raised_by_type: r.raised_by_type != null ? String(r.raised_by_type) : null,
    ticket_source: r.ticket_source != null ? String(r.ticket_source) : null,
    assigned_to_agent_id: r.assigned_to_agent_id != null ? Number(r.assigned_to_agent_id) : null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
    subject: r.subject != null ? String(r.subject) : null,
    description: r.description != null ? String(r.description) : null,
    ticket_title: r.ticket_title != null ? String(r.ticket_title) : null,
  };
}

export async function loadAgentSnapshot(sql: SqlClient, agentUserId: number): Promise<AgentSnapshot | null> {
  const rows = (await sql`
    SELECT user_id, current_status::text AS current_status, is_online
    FROM public.agent_profiles
    WHERE user_id = ${agentUserId}
    LIMIT 1
  `) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    user_id: Number(r.user_id),
    current_status: r.current_status != null ? String(r.current_status) : null,
    is_online: r.is_online === true || r.is_online === "t" || String(r.is_online).toLowerCase() === "true",
  };
}

async function hasCompletedOnce(
  sql: SqlClient,
  ruleId: number,
  ticketId: number | null,
  agentUserId: number | null,
  triggerEvent: AutomationTriggerEvent
): Promise<boolean> {
  if (ticketId != null) {
    const r = (await sql`
      SELECT 1 AS x
      FROM public.ticket_automation_executions
      WHERE rule_id = ${ruleId}
        AND ticket_id = ${ticketId}
        AND trigger_event = ${triggerEvent}
        AND execution_status = 'completed'
      LIMIT 1
    `) as { x?: unknown }[];
    return r.length > 0;
  }
  if (agentUserId != null) {
    const r = (await sql`
      SELECT 1 AS x
      FROM public.ticket_automation_executions
      WHERE rule_id = ${ruleId}
        AND agent_user_id = ${agentUserId}
        AND trigger_event = ${triggerEvent}
        AND execution_status = 'completed'
      LIMIT 1
    `) as { x?: unknown }[];
    return r.length > 0;
  }
  return false;
}

export type RunAutomationOptions = {
  dryRun?: boolean;
  workerLabel?: string;
};

/**
 * Evaluate and run all matching rules for a ticket-scoped trigger.
 */
export async function runTicketAutomation(
  sql: SqlClient,
  event: AutomationTriggerEvent,
  ticketId: number,
  opts: RunAutomationOptions = {}
): Promise<{ ran: number; errors: string[] }> {
  const errors: string[] = [];
  let ran = 0;
  if (event === "agent_went_online" || event === "agent_went_offline") {
    errors.push("use runAgentEventAutomation for agent lifecycle triggers");
    return { ran, errors };
  }

  let ticket = await loadTicketSnapshot(sql, ticketId);
  if (!ticket) return { ran, errors: ["ticket not found"] };

  let rules: AutomationRuleRow[];
  try {
    rules = await loadRules(sql, event);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ticket_automation_rules") || msg.includes("does not exist")) {
      return { ran: 0, errors: [] };
    }
    return { ran: 0, errors: [msg] };
  }

  const ctx: AutomationContext = { kind: "ticket", ticket };

  for (const rule of rules) {
    try {
      if (rule.once_per_ticket && (await hasCompletedOnce(sql, rule.id, ticketId, null, event))) {
        continue;
      }
      const conditions = await loadConditions(sql, rule.id);
      if (!evaluateConditions(conditions, ctx)) continue;

      const actions = await loadActions(sql, rule.id);
      if (actions.length === 0) continue;

      if (opts.dryRun) {
        ran++;
        continue;
      }

      const execStart = Date.now();
      const execRows = (await sql`
        INSERT INTO public.ticket_automation_executions (
          rule_id, ticket_id, agent_user_id, trigger_event, execution_status, started_at
        ) VALUES (
          ${rule.id}, ${ticketId}, NULL, ${event}, 'running', now()
        )
        RETURNING id
      `) as { id?: unknown }[];
      const execId = Number(execRows[0]?.id);

      let executed: string[] = [];
      let failed: string[] = [];
      try {
        const out = await applyActionListWithReload(
          sql,
          actions,
          ticket,
          null,
          Math.max(1, rule.max_action_retries ?? 2),
          { triggerEvent: event }
        );
        executed = out.executed;
        failed = out.failed;
      } catch (runErr) {
        const msg = runErr instanceof Error ? runErr.message : String(runErr);
        failed = [`engine: ${msg}`];
        if (Number.isFinite(execId)) {
          await sql`
            UPDATE public.ticket_automation_executions
            SET execution_status = 'failed',
                actions_failed = ${JSON.stringify(failed)}::jsonb,
                error_message = ${msg.slice(0, 2000)},
                completed_at = now(),
                execution_duration_ms = ${Date.now() - execStart}
            WHERE id = ${execId}
          `;
        }
        errors.push(`${rule.rule_code}: ${msg}`);
        await sql`
          INSERT INTO public.ticket_automation_logs (log_type, rule_id, ticket_id, summary, details)
          VALUES (
            'error',
            ${rule.id},
            ${ticketId},
            ${msg.slice(0, 500)},
            ${JSON.stringify({ event })}::jsonb
          )
        `;
        continue;
      }

      ticket = (await loadTicketSnapshot(sql, ticketId)) ?? ticket;
      const duration = Date.now() - execStart;
      const status = failed.length > 0 ? "failed" : "completed";

      if (Number.isFinite(execId)) {
        await sql`
          UPDATE public.ticket_automation_executions
          SET execution_status = ${status},
              actions_executed = ${JSON.stringify(executed)}::jsonb,
              actions_failed = ${JSON.stringify(failed)}::jsonb,
              error_message = ${failed.length ? failed.join("; ") : null},
              completed_at = now(),
              execution_duration_ms = ${duration}
          WHERE id = ${execId}
        `;
      }

      await sql`
        INSERT INTO public.ticket_automation_logs (log_type, rule_id, ticket_id, summary, details)
        VALUES (
          'execution',
          ${rule.id},
          ${ticketId},
          ${`Rule ${rule.rule_code} ${status}`},
          ${JSON.stringify({
            event,
            executed,
            failed,
            dryRun: false,
            worker: opts.workerLabel ?? null,
          })}::jsonb
        )
      `;

      ran++;
      if (failed.length) errors.push(`${rule.rule_code}: ${failed.join("; ")}`);

      if (rule.stop_after_match && status === "completed") break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${rule.rule_code}: ${msg}`);
      try {
        await sql`
          INSERT INTO public.ticket_automation_logs (log_type, rule_id, ticket_id, summary, details)
          VALUES (
            'error',
            ${rule.id},
            ${ticketId},
            ${msg.slice(0, 500)},
            ${JSON.stringify({ event })}::jsonb
          )
        `;
      } catch {
        // ignore
      }
    }
  }

  if (!opts.dryRun) {
    try {
      await applyFallbackRoutingGroupIfNeeded(sql, ticketId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`default queue fallback: ${msg}`);
    }
    /**
     * Rules often run assign_least_loaded before `group_id` exists; fallback then sets default routing group.
     * Without this pass, the ticket stayed unassigned until agent_went_online ran queue balance (offline/online toggle).
     */
    try {
      const t = await loadTicketSnapshot(sql, ticketId);
      if (t && t.assigned_to_agent_id == null && t.group_id != null) {
        const gate = await getTicketAutoAssignmentGate(sql, ticketId);
        if (gate.ok) {
          await runQueueBalanceAutoAssign(sql, { groupIds: [t.group_id] });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`queue balance after automation: ${msg}`);
    }
  }

  return { ran, errors };
}

/**
 * Rules triggered when an agent lifecycle event fires (online / offline).
 */
export async function runAgentEventAutomation(
  sql: SqlClient,
  agentUserId: number,
  event: "agent_went_online" | "agent_went_offline",
  opts: RunAutomationOptions = {}
): Promise<{ ran: number; errors: string[] }> {
  const errors: string[] = [];
  let ran = 0;

  const agent = await loadAgentSnapshot(sql, agentUserId);
  if (!agent) return { ran, errors: ["agent profile not found"] };

  let rules: AutomationRuleRow[];
  try {
    rules = await loadRules(sql, event);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ticket_automation_rules") || msg.includes("does not exist")) {
      return { ran: 0, errors: [] };
    }
    return { ran: 0, errors: [msg] };
  }

  const ctx: AutomationContext = { kind: "agent", agent };

  for (const rule of rules) {
    try {
      if (rule.once_per_ticket && (await hasCompletedOnce(sql, rule.id, null, agentUserId, event))) {
        continue;
      }
      const conditions = await loadConditions(sql, rule.id);
      if (!evaluateConditions(conditions, ctx)) continue;

      const actions = await loadActions(sql, rule.id);
      if (actions.length === 0) continue;

      if (opts.dryRun) {
        ran++;
        continue;
      }

      const execStart = Date.now();
      const execRows = (await sql`
        INSERT INTO public.ticket_automation_executions (
          rule_id, ticket_id, agent_user_id, trigger_event, execution_status, started_at
        ) VALUES (
          ${rule.id}, NULL, ${agentUserId}, ${event}, 'running', now()
        )
        RETURNING id
      `) as { id?: unknown }[];
      const execId = Number(execRows[0]?.id);

      let executed: string[] = [];
      let failed: string[] = [];
      try {
        const out = await applyActionListWithReload(
          sql,
          actions,
          null,
          agent,
          Math.max(1, rule.max_action_retries ?? 2),
          { triggerEvent: event }
        );
        executed = out.executed;
        failed = out.failed;
      } catch (runErr) {
        const msg = runErr instanceof Error ? runErr.message : String(runErr);
        failed = [`engine: ${msg}`];
        if (Number.isFinite(execId)) {
          await sql`
            UPDATE public.ticket_automation_executions
            SET execution_status = 'failed',
                actions_failed = ${JSON.stringify(failed)}::jsonb,
                error_message = ${msg.slice(0, 2000)},
                completed_at = now(),
                execution_duration_ms = ${Date.now() - execStart}
            WHERE id = ${execId}
          `;
        }
        errors.push(`${rule.rule_code}: ${msg}`);
        continue;
      }

      const duration = Date.now() - execStart;
      const status = failed.length > 0 ? "failed" : "completed";

      if (Number.isFinite(execId)) {
        await sql`
          UPDATE public.ticket_automation_executions
          SET execution_status = ${status},
              actions_executed = ${JSON.stringify(executed)}::jsonb,
              actions_failed = ${JSON.stringify(failed)}::jsonb,
              error_message = ${failed.length ? failed.join("; ") : null},
              completed_at = now(),
              execution_duration_ms = ${duration}
          WHERE id = ${execId}
        `;
      }

      await sql`
        INSERT INTO public.ticket_automation_logs (log_type, rule_id, ticket_id, summary, details)
        VALUES (
          'execution',
          ${rule.id},
          NULL,
          ${`Rule ${rule.rule_code} ${status} (agent ${agentUserId})`},
          ${JSON.stringify({
            event,
            agentUserId,
            executed,
            failed,
            worker: opts.workerLabel ?? null,
          })}::jsonb
        )
      `;

      ran++;
      if (failed.length) errors.push(`${rule.rule_code}: ${failed.join("; ")}`);
      if (rule.stop_after_match && status === "completed") break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${rule.rule_code}: ${msg}`);
    }
  }

  return { ran, errors };
}

/** @deprecated Prefer runAgentEventAutomation(..., "agent_went_online") */
export async function runAgentAutomation(
  sql: SqlClient,
  agentUserId: number,
  opts: RunAutomationOptions = {}
): Promise<{ ran: number; errors: string[] }> {
  return runAgentEventAutomation(sql, agentUserId, "agent_went_online", opts);
}

export async function runAgentOfflineAutomation(
  sql: SqlClient,
  agentUserId: number,
  opts: RunAutomationOptions = {}
): Promise<{ ran: number; errors: string[] }> {
  return runAgentEventAutomation(sql, agentUserId, "agent_went_offline", opts);
}
