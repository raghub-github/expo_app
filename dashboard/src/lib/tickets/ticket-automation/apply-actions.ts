import type { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit, type TicketAuditSqlClient } from "@/lib/db/operations/ticket-activity-audit";
import { getSystemUserById } from "@/lib/db/operations/users";
import {
  queueTicketAssignedNotification,
  queueTicketReopenedNotification,
} from "@/lib/tickets/ticket-notification-send";
import { runQueueBalanceAutoAssign } from "@/lib/tickets/queue-balance-auto-assign";
import {
  pickLeastLoadedAgentForGroup,
  pickPriorityWeightedAgentForGroup,
  pickRoundRobinAssigneeForGroup,
} from "./assignment-strategies";
import { getTicketAutoAssignmentGate } from "./assignment-eligibility";
import { checkAgentOpenTicketCapacity, isAgentOnlineForAssignment, logAssignmentSkipped } from "@/lib/tickets/agent-open-ticket-capacity";
import {
  actionTargetField,
  manualOverrideSkipReason,
  type ManualOverrideMap,
} from "@/lib/tickets/manual-update-guard";
import type { ActionRow, AgentSnapshot, AutomationTriggerEvent, TicketSnapshot } from "./types";

export type ApplyActionInvokeOptions = {
  triggerEvent?: AutomationTriggerEvent;
  /**
   * Fields an agent/admin has explicitly set on this ticket. Actions that would
   * overwrite one of them are skipped instead of reverting the human's choice.
   */
  manualOverrides?: ManualOverrideMap;
};

type SqlClient = ReturnType<typeof getSql>;

/** Use explicit group from action payload when set; otherwise ticket.queue. */
export function resolveAssignmentGroupId(ticket: TicketSnapshot, payload: Record<string, unknown>): number | null {
  const raw = payload.group_id ?? payload.groupId ?? payload.target_group_id ?? payload.targetGroupId;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const g = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(g) && g > 0) return g;
  }
  return ticket.group_id != null && Number.isFinite(ticket.group_id) ? ticket.group_id : null;
}

async function loadTicket(sql: SqlClient, id: number): Promise<TicketSnapshot | null> {
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
    WHERE id = ${id}
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

/**
 * After all rules run: if ticket still has no queue and settings define default_routing_group_id, set it.
 *
 * Skipped when an agent/admin deliberately cleared the group — otherwise a manual
 * "no group" is silently replaced by the default routing group on the next update.
 */
export async function applyFallbackRoutingGroupIfNeeded(
  sql: SqlClient,
  ticketId: number,
  manualOverrides?: ManualOverrideMap
): Promise<void> {
  if (manualOverrides?.group) return;
  const t = await loadTicket(sql, ticketId);
  if (!t || t.group_id != null) return;
  let gid: number | null = null;
  try {
    const rows = (await sql`
      SELECT default_routing_group_id
      FROM public.ticket_queue_auto_assign_settings
      WHERE id = 1
      LIMIT 1
    `) as { default_routing_group_id?: unknown }[];
    const n = Number(rows[0]?.default_routing_group_id);
    if (Number.isFinite(n) && n > 0) gid = n;
  } catch {
    return;
  }
  if (gid == null) return;
  await sql`
    UPDATE public.unified_tickets
    SET group_id = ${gid}, updated_at = now()
    WHERE id = ${ticketId} AND group_id IS NULL
  `;
}

function auditSql(tx: SqlClient): TicketAuditSqlClient {
  return tx as unknown as TicketAuditSqlClient;
}

export type ActionApplyResult = { ok: true; detail: string } | { ok: false; detail: string };

function allowAssignDespiteExistingAgent(invoke?: ApplyActionInvokeOptions): boolean {
  return invoke?.triggerEvent === "ticket_reopened";
}

export async function applySingleAction(
  sql: SqlClient,
  action: ActionRow,
  ticket: TicketSnapshot | null,
  agentCtx: AgentSnapshot | null,
  invoke?: ApplyActionInvokeOptions
): Promise<ActionApplyResult> {
  const type = action.action_type.trim().toLowerCase();
  const p = action.payload ?? {};

  if (type === "run_queue_balance_for_agent") {
    const aid = agentCtx?.user_id ?? (typeof p.for_agent_user_id === "number" ? p.for_agent_user_id : Number(p.for_agent_user_id));
    if (!Number.isFinite(aid)) return { ok: false, detail: "run_queue_balance_for_agent: missing agent id" };
    await runQueueBalanceAutoAssign(sql, { forAgentUserId: Number(aid) });
    return { ok: true, detail: `run_queue_balance_for_agent user ${aid}` };
  }

  if (type === "run_queue_balance_for_group") {
    const raw = p.group_id ?? p.groupId;
    const g = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(g) || g <= 0) return { ok: false, detail: "run_queue_balance_for_group: invalid group_id" };
    const out = await runQueueBalanceAutoAssign(sql, { groupIds: [g] });
    return { ok: true, detail: `run_queue_balance_for_group group ${g} assigned ${out.assigned}` };
  }

  if (!ticket) {
    return { ok: false, detail: `Action ${type} requires a ticket context` };
  }

  /**
   * A human owns this field — do not revert their edit. Reported as `ok` so the
   * rule is not marked failed and does not burn its retries; the detail string
   * lands in ticket_automation_logs / _executions so the skip is visible.
   */
  const targetField = actionTargetField(type);
  if (targetField && invoke?.manualOverrides?.[targetField]) {
    return {
      ok: true,
      detail: manualOverrideSkipReason(targetField, invoke.manualOverrides[targetField]),
    };
  }

  if (type === "assign_round_robin") {
    if (ticket.assigned_to_agent_id != null && !allowAssignDespiteExistingAgent(invoke))
      return { ok: true, detail: "skip assign (already assigned)" };
    const gate = await getTicketAutoAssignmentGate(sql, ticket.id);
    if (!gate.ok) return { ok: true, detail: `skip assign (${gate.code})` };
    const assignGid = resolveAssignmentGroupId(ticket, p);
    if (assignGid == null)
      return { ok: false, detail: "assign_round_robin: set ticket queue or add group id on the action" };
    const picked = await pickRoundRobinAssigneeForGroup(sql, assignGid);
    if (picked == null) {
      void logAssignmentSkipped(sql, {
        ticketId: ticket.id,
        summary: "assign_round_robin: no eligible agent (all at capacity or offline)",
        details: { action: "assign_round_robin", group_id: assignGid },
      });
      return { ok: false, detail: "assign_round_robin: no eligible agent" };
    }
    return assignToAgentId(sql, ticket.id, picked, "automation_round_robin", {
      replaceExisting: allowAssignDespiteExistingAgent(invoke),
    });
  }

  if (type === "assign_least_loaded") {
    if (ticket.assigned_to_agent_id != null && !allowAssignDespiteExistingAgent(invoke))
      return { ok: true, detail: "skip assign (already assigned)" };
    const gateL = await getTicketAutoAssignmentGate(sql, ticket.id);
    if (!gateL.ok) return { ok: true, detail: `skip assign (${gateL.code})` };
    const assignGid = resolveAssignmentGroupId(ticket, p);
    if (assignGid == null)
      return { ok: false, detail: "assign_least_loaded: set ticket queue or add group id on the action" };
    const picked = await pickLeastLoadedAgentForGroup(sql, assignGid);
    if (picked == null) {
      void logAssignmentSkipped(sql, {
        ticketId: ticket.id,
        summary: "assign_least_loaded: no eligible agent (all at capacity or offline)",
        details: { action: "assign_least_loaded", group_id: assignGid },
      });
      return { ok: false, detail: "assign_least_loaded: no eligible agent" };
    }
    return assignToAgentId(sql, ticket.id, picked, "automation_least_loaded");
  }

  if (type === "assign_priority_weighted") {
    if (ticket.assigned_to_agent_id != null) return { ok: true, detail: "skip assign (already assigned)" };
    const gateP = await getTicketAutoAssignmentGate(sql, ticket.id);
    if (!gateP.ok) return { ok: true, detail: `skip assign (${gateP.code})` };
    const assignGid = resolveAssignmentGroupId(ticket, p);
    if (assignGid == null)
      return { ok: false, detail: "assign_priority_weighted: set ticket queue or add group id on the action" };
    const picked = await pickPriorityWeightedAgentForGroup(sql, assignGid);
    if (picked == null) {
      void logAssignmentSkipped(sql, {
        ticketId: ticket.id,
        summary: "assign_priority_weighted: no eligible agent (all at capacity or offline)",
        details: { action: "assign_priority_weighted", group_id: assignGid },
      });
      return { ok: false, detail: "assign_priority_weighted: no eligible agent" };
    }
    return assignToAgentId(sql, ticket.id, picked, "automation_priority_weighted", {
      replaceExisting: allowAssignDespiteExistingAgent(invoke),
    });
  }

  if (type === "assign_to_agent") {
    if (ticket.assigned_to_agent_id != null && !allowAssignDespiteExistingAgent(invoke))
      return { ok: true, detail: "skip assign (already assigned)" };
    const raw = p.agent_user_id ?? p.agentUserId;
    const aid = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(aid)) return { ok: false, detail: "assign_to_agent: invalid agent_user_id" };
    return assignToAgentId(sql, ticket.id, aid, "automation_assign_to_agent", {
      replaceExisting: allowAssignDespiteExistingAgent(invoke),
    });
  }

  if (type === "set_status") {
    const st = String(p.status ?? "").trim().toUpperCase().replace(/-/g, "_");
    if (!st) return { ok: false, detail: "set_status: missing status" };
    await sql`
      UPDATE public.unified_tickets
      SET status = ${st}::public.unified_ticket_status, updated_at = now()
      WHERE id = ${ticket.id}
    `;
    return { ok: true, detail: `set_status ${st}` };
  }

  if (type === "set_priority") {
    const pr = String(p.priority ?? "").trim().toUpperCase().replace(/-/g, "_");
    if (!pr) return { ok: false, detail: "set_priority: missing priority" };
    await sql`
      UPDATE public.unified_tickets
      SET priority = ${pr}::public.unified_ticket_priority, updated_at = now()
      WHERE id = ${ticket.id}
    `;
    return { ok: true, detail: `set_priority ${pr}` };
  }

  if (type === "add_tags") {
    const raw = p.tags ?? p.tag;
    const add: string[] = Array.isArray(raw)
      ? raw.map((x) => String(x).trim()).filter(Boolean)
      : String(raw ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (add.length === 0) return { ok: false, detail: "add_tags: no tags" };
    const cur = ticket.tags ?? [];
    const set = new Set([...cur.map((t) => t.trim()).filter(Boolean), ...add]);
    const merged = [...set];
    await sql`
      UPDATE public.unified_tickets
      SET tags = ${merged}, updated_at = now()
      WHERE id = ${ticket.id}
    `;
    return { ok: true, detail: `add_tags (${merged.length} total)` };
  }

  if (type === "set_group") {
    const raw = p.group_id ?? p.groupId;
    const g = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(g)) return { ok: false, detail: "set_group: invalid group_id" };
    await sql`
      UPDATE public.unified_tickets
      SET group_id = ${g}, updated_at = now()
      WHERE id = ${ticket.id}
    `;
    return { ok: true, detail: `set_group ${g}` };
  }

  if (type === "send_notification") {
    const ev = String(p.event_code ?? p.event ?? "ticket_assigned").trim() as "ticket_assigned" | "ticket_reopened";
    if (ev !== "ticket_assigned" && ev !== "ticket_reopened") {
      return { ok: false, detail: "send_notification: invalid event_code" };
    }
    const assigneeId =
      ticket.assigned_to_agent_id ??
      (typeof p.agent_user_id === "number" ? p.agent_user_id : Number(p.agent_user_id));
    if (ev === "ticket_assigned") {
      if (!Number.isFinite(assigneeId)) return { ok: false, detail: "send_notification: need assigned agent" };
      void queueTicketAssignedNotification(auditSql(sql), ticket.id, Number(assigneeId)).catch(() => {});
    } else {
      void queueTicketReopenedNotification(auditSql(sql), ticket.id).catch(() => {});
    }
    return { ok: true, detail: `send_notification ${ev}` };
  }

  return { ok: false, detail: `unknown action_type: ${action.action_type}` };
}

function mapAssignmentTypeColumn(assignedByType: string): string {
  const m: Record<string, string> = {
    automation_round_robin: "auto_round_robin",
    automation_least_loaded: "auto_least_loaded",
    automation_priority_weighted: "auto_priority_weighted",
    automation_assign_to_agent: "auto_specific_agent",
  };
  if (m[assignedByType]) return m[assignedByType];
  const shortened = assignedByType.replace(/^automation_/, "auto_").slice(0, 80);
  return shortened || "auto_unknown";
}

function assignmentActivityLabel(assignedByType: string): string {
  const t = assignedByType.trim().toLowerCase();
  if (t.startsWith("automation_") || t.startsWith("auto_")) return "Auto Assigned";
  return assignedByType;
}

async function assignToAgentId(
  sql: SqlClient,
  ticketId: number,
  agentId: number,
  assignedByType: string,
  opts: { replaceExisting?: boolean } = {}
): Promise<ActionApplyResult> {
  const replaceExisting = opts.replaceExisting === true;
  const online = await isAgentOnlineForAssignment(sql, agentId);
  if (!online) {
    void logAssignmentSkipped(sql, {
      ticketId,
      agentUserId: agentId,
      summary: "Agent is offline or unavailable for assignment",
      details: { assignedByType },
    });
    return { ok: false, detail: "Agent is offline or unavailable for assignment" };
  }
  const cap = await checkAgentOpenTicketCapacity(sql, agentId);
  if (!cap.ok) {
    void logAssignmentSkipped(sql, {
      ticketId,
      agentUserId: agentId,
      summary: cap.reason,
      details: { assignedByType, open: cap.open, effectiveCap: cap.effectiveCap },
    });
    return { ok: false, detail: cap.reason };
  }

  const user = await getSystemUserById(agentId);
  const name = user?.fullName ?? user?.email ?? null;
  const atype = mapAssignmentTypeColumn(assignedByType);
  let rows: { id?: unknown }[];
  try {
    rows = replaceExisting
      ? ((await sql`
      UPDATE public.unified_tickets
      SET assigned_to_agent_id = ${agentId},
          assigned_to_agent_name = ${name},
          assigned_at = now(),
          auto_assigned = true,
          assignment_type = ${atype},
          updated_at = now()
      WHERE id = ${ticketId}
      RETURNING id
    `) as { id?: unknown }[])
      : ((await sql`
      UPDATE public.unified_tickets
      SET assigned_to_agent_id = ${agentId},
          assigned_to_agent_name = ${name},
          assigned_at = now(),
          auto_assigned = true,
          assignment_type = ${atype},
          updated_at = now()
      WHERE id = ${ticketId}
        AND assigned_to_agent_id IS NULL
      RETURNING id
    `) as { id?: unknown }[]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("assignment_type")) {
      rows = replaceExisting
        ? ((await sql`
        UPDATE public.unified_tickets
        SET assigned_to_agent_id = ${agentId},
            assigned_to_agent_name = ${name},
            assigned_at = now(),
            auto_assigned = true,
            updated_at = now()
        WHERE id = ${ticketId}
        RETURNING id
      `) as { id?: unknown }[])
        : ((await sql`
        UPDATE public.unified_tickets
        SET assigned_to_agent_id = ${agentId},
            assigned_to_agent_name = ${name},
            assigned_at = now(),
            auto_assigned = true,
            updated_at = now()
        WHERE id = ${ticketId}
          AND assigned_to_agent_id IS NULL
        RETURNING id
      `) as { id?: unknown }[]);
    } else {
      throw e;
    }
  }
  if (!rows.length) {
    const t = await loadTicket(sql, ticketId);
    if (!replaceExisting && t?.assigned_to_agent_id != null) return { ok: true, detail: "already assigned (race)" };
    return { ok: false, detail: "assign update did not apply" };
  }
  try {
    await sql`
      INSERT INTO public.ticket_assignment_history (
        ticket_id, agent_user_id, assignment_type, actor_user_id
      ) VALUES (${ticketId}, ${agentId}, ${assignedByType}, NULL)
    `;
  } catch {
    // non-fatal
  }
  await insertTicketActivityAudit(auditSql(sql), {
    ticket_id: ticketId,
    activity_type: "assignment",
    activity_category: "assignment",
    activity_description: `Assigned to ${name ?? "agent"} (${assignmentActivityLabel(assignedByType)})`,
    actor_type: "SYSTEM",
    actor_name: "Automation",
    assigned_to_user_id: agentId,
    assigned_to_name: name ?? undefined,
    assigned_by_type: assignedByType,
  });
  void queueTicketAssignedNotification(auditSql(sql), ticketId, agentId).catch(() => {});
  return { ok: true, detail: `assigned ${agentId}` };
}

function normalizeActionCombine(raw: string | null | undefined): "and" | "or" | "if" {
  const t = String(raw ?? "and").trim().toLowerCase();
  if (t === "or") return "or";
  if (t === "if" || t === "iff") return "if";
  return "and";
}

export async function applyActionListWithReload(
  sql: SqlClient,
  actions: ActionRow[],
  startTicket: TicketSnapshot | null,
  agentCtx: AgentSnapshot | null,
  maxRetriesPerAction: number,
  invoke?: ApplyActionInvokeOptions
): Promise<{ executed: string[]; failed: string[] }> {
  const executed: string[] = [];
  const failed: string[] = [];
  let ticket = startTicket;

  const sorted = [...actions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  let prevExecOk = true;

  for (let idx = 0; idx < sorted.length; idx++) {
    const action = sorted[idx];
    if (idx > 0) {
      const join = normalizeActionCombine(action.combine_with_previous);
      if (join === "or" && prevExecOk) {
        executed.push(`${action.action_type}: skipped (OR: previous action succeeded)`);
        continue;
      }
      if (join === "if" && !prevExecOk) {
        executed.push(`${action.action_type}: skipped (IF: previous action failed)`);
        continue;
      }
    }

    let attempt = 0;
    let lastErr = "";
    let thisOk = false;
    for (;;) {
      attempt++;
      try {
        if (ticket?.id != null) {
          ticket = (await loadTicket(sql, ticket.id)) ?? ticket;
        }

        const res = await applySingleAction(sql, action, ticket, agentCtx, invoke);
        if (res.ok) {
          executed.push(`${action.action_type}: ${res.detail}`);
          if (ticket?.id != null) ticket = (await loadTicket(sql, ticket.id)) ?? ticket;
          thisOk = true;
          break;
        }
        lastErr = res.detail;
        if (attempt > maxRetriesPerAction) {
          failed.push(`${action.action_type}: ${lastErr}`);
          thisOk = false;
          break;
        }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (attempt > maxRetriesPerAction) {
          failed.push(`${action.action_type}: ${lastErr}`);
          thisOk = false;
          break;
        }
      }
    }
    prevExecOk = thisOk;
  }

  return { executed, failed };
}
